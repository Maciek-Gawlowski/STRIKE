# STRIKE — Persistence Refactor Summary

This change adds **persistent local storage** to STRIKE and prepares the data
layer for a future backend (Supabase) sync. **No UI, screens, or features were
changed** — only the data layer.

## What the user sees

Nothing different — same screens, same demo data, same flows. The one new
behavior is that data now survives the app closing:

- Completed trips, their routes, events, and catches persist across restarts.
- User preferences / app state (last location, location source, last completed
  trip) persist.
- A trip that was in progress when the app closed is restored and tracking
  resumes (it was previously lost on close).

## New dependencies

| Package | Version | Use |
| --- | --- | --- |
| `@react-native-async-storage/async-storage` | 2.2.0 | Small key/value app state & preferences |
| `expo-sqlite` | ~16.0.10 | Structured trip / event / weather storage |

`expo-sqlite` was also added to the `plugins` array in `app.json` (done
automatically by `expo install`).

> Note: installs were run with `--legacy-peer-deps` because of a pre-existing,
> unrelated `@radix-ui` peer-dependency conflict already present in
> `node_modules`. The two new packages themselves have no conflicts.

## New files (`/database`)

| File | Responsibility |
| --- | --- |
| `database/db.ts` | Opens the single SQLite connection (lazy, memoized), runs migrations, and exposes a **serialized write queue** (`enqueueWrite`) plus `flushWrites`. |
| `database/schema.ts` | `CREATE TABLE` statements for `trips`, `events`, `weather_snapshots`, indexes, and the `migrate()` runner (uses `PRAGMA user_version`). |
| `database/queries.ts` | All CRUD + row↔domain mapping. The store never writes raw SQL. Includes offline-sync helpers (`getPendingEvents`, `markEventSynced`) and weather helpers. |
| `database/preferences.ts` | AsyncStorage-backed app state/preferences (`loadAppState`, `saveAppState`, seed flag). |

## Modified files

- `store/useStrikeStore.ts` — **the only meaningful change.** The Zustand
  interface (state shape, action names, signatures, return values) is unchanged,
  so **no screen needed editing**. Added:
  - Every mutating action now also writes to SQLite via `enqueueWrite(...)`
    and/or persists app state to AsyncStorage. Because the actions stay
    synchronous (the UI relies on that), writes are queued fire-and-forget and
    applied in order.
  - `hydrateStore()` — loads SQLite + AsyncStorage into the store on launch,
    seeds demo data on first ever launch, and restores an in-progress trip.
    It is invoked once automatically when the store module is first imported,
    so **no change to `app/_layout.tsx` or any screen was required.**
- `package.json` / `package-lock.json` — new dependencies.
- `app.json` — `expo-sqlite` config plugin.

## Database schema

```
trips
  id TEXT PK, name TEXT, start_time TEXT, end_time TEXT,
  distance REAL, duration INTEGER, steps INTEGER, route_json TEXT

events
  id TEXT PK, trip_id TEXT FK->trips, type TEXT, timestamp TEXT,
  lat REAL, lng REAL, photo_uri TEXT, species TEXT, comment TEXT,
  released INTEGER, sync_status TEXT DEFAULT 'pending'

weather_snapshots
  id TEXT PK, event_id TEXT FK->events, air_temp REAL, water_temp REAL,
  wind_speed REAL, wind_direction TEXT, pressure REAL
```

### Deviations from the spec (and why)

- **`trips.steps`** added — the Home and Summary screens display a "Steps"
  metric. Dropping it would have changed the UI.
- **`events.sync_status`** added per task #4 (`pending` / `synced`) for
  offline-first sync.
- **`events.released`** stores the inverse of the in-memory `kept` flag
  (`released = !kept`; `NULL` for contact/lost events that have no
  kept/released meaning). The store/UI keep using `kept` exactly as before; the
  mapping lives in `queries.ts`.
- **`weather_snapshots`** table is created and has full read/write helpers, but
  is **not wired into any action** — the current app captures no per-event
  weather (only a static mock strip), and adding capture would be a new feature.
  The table is ready for when weather capture is built.

## Offline-ready architecture

- All writes go to local SQLite/AsyncStorage and work fully offline — there is
  no network path in any action.
- `events.sync_status` defaults to `'pending'` on every insert.
- `queries.ts` exposes `getPendingEvents()` and `markEventSynced()` as the
  hooks a future sync worker will use. **No Supabase connection is made.**

## How persistence works (design notes)

- **Zustand stays the synchronous, in-memory source of truth** so screens are
  untouched. SQLite is written behind it.
- Writes are funneled through a single promise chain (`enqueueWrite`) so they
  apply in call order and never interleave (e.g. the trip row is inserted before
  the route points/events that reference it). Failed writes are logged, never
  thrown into the UI.
- On launch, `hydrateStore()` replaces the in-memory demo defaults with the
  persisted data. On the very first launch it seeds the original demo trips into
  SQLite (guarded by an AsyncStorage flag), so the demo data still appears and
  then persists like real data.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual check: start/stop a trip, add contacts/lost/catches, fully
  close the app, reopen → trips, routes, events, and catches are all still
  present; demo trips remain in the logbook.

---

# STRIKE — Real Weather Integration (Open-Meteo)

This change replaces the static mock weather with **real conditions from
Open-Meteo** (free, no API key) and wires the previously-unused
`weather_snapshots` table into the app. It is **fully offline-first**: weather is
always an enhancement and never blocks the UI or the data layer.

## What the user sees

- The home weather strip ("Stevns Klint" card) shows **real** air temp, water
  temp, wind, and pressure when online — same layout, real numbers. Tide/sunrise
  keep their existing values (Open-Meteo has no current field for them).
- The catch registration screen now shows a **weather row** (air, wind, pressure,
  and water temp when available) under the time/GPS line, in the existing pill
  style.
- Wind is shown as a **compass label** (e.g. `NW 7 m/s`), not raw degrees.
- Offline, everything still works: events save immediately, and their weather is
  fetched automatically on the next online launch.

## New dependency

| Package | Version | Use |
| --- | --- | --- |
| `expo-network` | ~8.0.8 | Connectivity check for the offline weather back-fill |

(Installed with `--legacy-peer-deps` for the same pre-existing `@radix-ui`
conflict noted above.)

## New file

- `services/weather.ts` — the weather service:
  - `fetchWeather(lat, lng)` → calls the **forecast** and **marine** APIs in
    parallel and returns `{ airTemp, windSpeed, windDirection, pressure,
    waterTemp }` or `null` on failure. Wind is requested in m/s
    (`wind_speed_unit=ms`). Marine/water temp degrades to `null` for inland
    coordinates or on its own failure without failing the whole call. An
    `AbortController` timeout (8s) keeps poor coverage from hanging.
  - `degreesToCompass(deg)` / `formatWind(data)` — display helpers (16-point
    compass, e.g. `NW`, `SSW`).
  - `captureWeatherForEvent(eventId, lat, lng)` — background fetch + persist for
    a single event; no-ops when offline.
  - `isOnline()` — best-effort connectivity via `expo-network` (unknown
    reachability is treated as online).
  - `syncPendingWeather()` — finds events with no weather snapshot and back-fills
    them when online.

## Modified files

- `database/queries.ts` — added `getEventsMissingWeather()` (LEFT JOIN of
  `events` against `weather_snapshots`) and the `EventLocation` type. The
  existing `insertWeatherSnapshot` / `getWeatherForEvent` helpers are now used.
- `store/useStrikeStore.ts`:
  - New state `weather: WeatherData | null` and action `refreshWeather(position?)`
    (fire-and-forget; never blocks).
  - `startTrip` → refreshes weather for the start location.
  - `addEvent` → after persisting the event, calls `captureWeatherForEvent(...)`
    in the background (covers contact/lost/catch, since `addCatch` delegates to
    `addEvent`).
  - `hydrateStore` (app start) → runs `syncPendingWeather()` and
    `refreshWeather()`.
- `components/WeatherStrip.tsx` — reads `store.weather`; same layout, real
  numbers when available, full mock fallback when offline.
- `app/catch.tsx` — added the weather row + a one-time `refreshWeather()` on
  open. No layout/style changes elsewhere.
- `package.json` / `package-lock.json` — `expo-network`.

## How offline-first is guaranteed

- Every network call lives behind `try/catch` and resolves to `null`; nothing in
  an action awaits the network.
- Event creation persists immediately with `sync_status = 'pending'`; weather is
  captured separately and independently.
- Events created offline have no `weather_snapshots` row; `getEventsMissingWeather`
  finds them and `syncPendingWeather()` fills them in on the next online launch.
- Snapshot ids are deterministic (`wx-<eventId>`) so re-syncing is idempotent
  (upsert, no duplicates).

## Schema note

- `weather_snapshots.wind_direction` is TEXT, so it stores the **compass label**
  (e.g. `NW`); numeric speed/temps/pressure are stored as-is. No schema change
  was needed — the table already existed.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - Start a trip with GPS online → real weather appears in the home strip and on
    the catch screen.
  - Create an event while offline → the event saves immediately
    (`sync_status = 'pending'`, no weather row); reopen the app online → weather
    is back-filled into `weather_snapshots`.
  - Wind direction renders as a compass label (`NW`, `SE`, …), not degrees.

---

# STRIKE — Statistics Screen

Adds a **Statistics screen** computed entirely from SQLite (not the Zustand
store). All trip/event/weather data already persisted is turned into aggregate
metrics, records, and breakdowns.

## What the user sees

- A new **bar-chart button** in the home header (top right, left of the logbook
  icon) → opens `/stats`.
- A **Statistics** screen (dark UI, matching the app) with sections:
  Overview (2×2 grid), Averages, Best time of day, Catches by wind direction,
  Catches by water temperature, and Records (longest trip, best trip).
- **Pull-to-refresh** re-queries SQLite.
- **Empty state**: "Start your first trip to see statistics" when there are no
  completed trips.

## New files

- `services/statistics.ts` — `getStatistics(): Promise<Statistics | null>`.
  Queries SQLite directly and returns `null` when there are no completed trips.
  Computes: `totalTrips`, `totalCatches`, `totalContacts`, `totalLostFish`,
  `catchesPerTrip`, `contactsPerTrip`, `avgDistanceBetweenContacts` (km/contact),
  `avgTimeBetweenContacts` (min/contact), `bestTimeOfDay` (busiest 3h window for
  catches, e.g. `06:00-09:00`), `catchesByWindDirection` (sorted desc),
  `catchesByWaterTemp` (`<8°C` / `8-12°C` / `12-16°C` / `>16°C`),
  `totalDistance` (km), `totalHours`, `longestTrip`, `bestTrip`.
- `app/stats.tsx` — the screen + display formatting (friendly time-of-day labels,
  date formatting, "1 contact per X km" / "1 catch per Y hours" lines).

## Modified files

- `components/Screen.tsx` — added an optional `refreshControl` prop (additive,
  non-breaking) so screens can opt into pull-to-refresh without changing styling.
- `app/index.tsx` — added the stats button (`bar-chart-outline`) next to the
  logbook button in the header.

## Design notes / decisions

- **All metrics are over *completed* trips** (`end_time IS NOT NULL`) and their
  events, so every ratio (catches/trip, km/contact, etc.) is internally
  consistent. An in-progress trip is excluded until it ends.
- **`avgDistanceBetweenContacts`** = total distance ÷ total contacts (matches the
  "1 contact per 1.8 km" framing). **`avgTimeBetweenContacts`** = total time ÷
  total contacts. The screen also derives **hours-per-catch** (total hours ÷
  catches) for the "1 catch per X hours" line.
- **`bestTimeOfDay`** uses local time-of-day (computed in JS from event
  timestamps) bucketed into eight 3-hour windows; the screen maps the window to a
  friendly label ("Early morning", etc.).
- Wind/water breakdowns join `events` → `weather_snapshots`, so they only reflect
  catches that have a captured weather snapshot.
- **No new dependencies** — uses existing `expo-sqlite` + React Native
  `RefreshControl`.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - Open the stats button on Home → metrics reflect the seeded/real trips.
  - Pull down to refresh → values re-query SQLite.
  - With no trips, the empty-state message shows.

---

# STRIKE — Privacy & Sharing Settings

Adds **per-catch privacy levels**, a privacy settings screen, and visible privacy
badges. The guiding rule: **default is always `private`** — a fishing spot is
never shared without an explicit choice.

## What the user sees

- Each catch now has a **Privacy** selector (in the catch screen, under
  Released/Kept): 🔒 Private / 📍 Area only / 🌍 Public. Defaults to the user's
  chosen default (itself `private` out of the box).
- A new **gear button** on the home header (top left) → **Privacy settings**
  screen with: default privacy, a "your data" explainer, and a Bite Map
  contribution toggle (default on).
- The **logbook** shows a small privacy badge on each trip card
  (lock / location / globe icon) reflecting the most-shared catch in that trip.

## Database migration (schema v2)

- `events.privacy_level TEXT NOT NULL DEFAULT 'private'`.
- `SCHEMA_VERSION` bumped `1 → 2` in `database/schema.ts`. `migrate()` now applies
  incremental, **idempotent** steps gated on `PRAGMA user_version`: the v2 step
  runs `ALTER TABLE events ADD COLUMN privacy_level ...` (guarded by a
  `PRAGMA table_info` column check), so **all existing rows get `'private'`** and
  fresh installs converge on the same schema. The baseline `CREATE TABLE` is left
  unchanged so the ALTER path is the single source of truth for this column.

## New / modified files

- `app/privacy.tsx` *(new)* — settings screen (default-privacy pill selector,
  data explainer text, Bite Map `Switch`). Reads/writes AsyncStorage.
- `database/preferences.ts` — `getDefaultPrivacy` / `setDefaultPrivacy`
  (default `private`) and `getBiteMapContribution` / `setBiteMapContribution`
  (default `true`).
- `database/queries.ts` — `EventRow.privacy_level`, mapping in `rowToEvent`
  (defaults to `private`), and `privacy_level` added to the `upsertEvent`
  insert/upsert.
- `store/useStrikeStore.ts` — new `PrivacyLevel` type; `StrikeEvent.privacyLevel`
  (optional, defaults to `private` on creation); `addEvent` sets `private` unless
  overridden; `addCatch` accepts/forwards `privacyLevel`.
- `app/catch.tsx` — privacy selector (3 pill options, same style as
  Released/Kept), seeded from the default-privacy preference, saved with the
  catch.
- `app/index.tsx` — `settings-outline` gear button on the left of the header.
- `app/logbook.tsx` — per-trip privacy badge.

## Design notes / decisions

- **`privacyLevel` is optional in the in-memory type** but always written to (and
  read from) SQLite as a concrete value. This keeps the in-memory demo data and
  any other event construction safe while the DB column is never null.
- **Logbook badge is per-trip** (cards represent trips, not individual catches).
  It shows the *most-shared* level among the trip's catches (public > area_only >
  private) so the user can tell at a glance if a trip exposes any location;
  trips with no catches show the private lock.
- **No new dependencies** — uses the existing AsyncStorage + React Native
  `Switch`.
- The Bite Map contribution flag and `area_only` / `public` levels are **stored
  but not yet acted on** (no Bite Map upload exists yet) — this lays the
  groundwork without sharing anything.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - New catch defaults to Private; changing the selector persists the chosen
    level to SQLite (`events.privacy_level`).
  - Existing/seeded catches read back as `private` after the migration.
  - Settings screen: changing default privacy affects the next catch's initial
    selection; Bite Map toggle persists across restarts.
  - Logbook cards show the correct privacy badge.

---

# STRIKE — Brand Identity

Applies the official STRIKE visual identity: deep-navy backgrounds, dark-teal
cards, amber accents/CTAs, and Montserrat/Raleway typography. **No navigation,
data layer, screens, or map marker colors were changed** — visual identity only.

## New dependencies

| Package | Use |
| --- | --- |
| `@expo-google-fonts/montserrat` | Headings, logo, buttons, numbers |
| `@expo-google-fonts/raleway` | Body text and labels |
| `expo-font` | `useFonts` loader |
| `expo-splash-screen` | Hold native splash until fonts load |

## New files (the theme)

- `theme/colors.ts` — full brand palette:
  navy `#0D1B2A` (bg), teal `#1B3A4B` (cards), green `#4C6B5A`, grey `#D9DAD5`
  (text), amber `#FFBA00` (CTAs/active), plus derived tokens (`textMuted`,
  `field`, `border`, `amberSoft`, `danger*`, `textOnAmber`).
- `theme/fonts.ts` — Montserrat (`black`/`heading`/`semibold`/`medium`) and
  Raleway (`body`/`bodyMedium`/`bodySemibold`/`bodyBold`) family constants.

## What changed

- **Typography** — `app/_layout.tsx` loads the Montserrat + Raleway weights via
  `useFonts` and holds the native splash (`expo-splash-screen`) until ready.
  All headings/logo/buttons/metric numbers use Montserrat; body text and labels
  use Raleway. (Custom fonts replace `fontWeight` with the matching `fontFamily`,
  since each weight is its own family.)
- **Colors** — every screen/component StyleSheet now references `theme/colors.ts`
  instead of the old teal-green palette. Backgrounds → navy gradient, cards →
  teal, primary CTAs (Start Fishing Trip, Save Catch, New Trip, modal Start) →
  amber with navy text, secondary buttons → teal/field with grey text.
  Active states (Released/Kept, privacy pills, live pill, best-time highlight)
  → amber.
- **Home header** (`app/index.tsx`) — "SEA TROUT FIELD LOG" is a small grey
  Raleway kicker, "STRIKE" is large Montserrat Black, and a new amber Raleway
  tagline **"FISH. DATA. CONNECT."** sits beneath it.
- **Splash / loading** — navy splash background (`app.json`) plus a branded
  in-app loading view (STRIKE wordmark, amber accent line, tagline) shown while
  fonts load.
- **Buttons** (`components/ActionButton.tsx`) — tones remapped: Start → amber
  primary, Contact → amber/gold, Lost Fish → red (kept), New Catch → teal
  secondary; foreground color is per-tone (navy on amber, light on red/teal).
- **Weather strip** — teal card, Montserrat-Medium location, navy data pills with
  grey text.
- **Statistics & logbook** — teal cards, Montserrat-Bold section headers & metric
  numbers, Raleway grey labels; logbook privacy badges recolored to brand
  (grey / amber / green).
- **Icons** — Ionicons kept; active/CTA icons use amber, inactive/standard icons
  use grey (`Colors.text` / `Colors.textMuted`).

## Deliberately unchanged

- **Map marker colors** and everything inside `components/TripMap.tsx` (tile
  theme, contact/lost/catch markers, route line, legend) — per constraint.
- **Event dot / event icon colors** on summary and trip-review screens — these
  mirror the marker semantics (yellow contact, green catch, red lost), so they
  were kept.
- **No logo.png / splash.png provided** — the asset-dependent steps (custom app
  icon, header logo image, splash image) were skipped; the header uses the
  STRIKE wordmark + tagline and the splash uses the navy branded loading view.
  Drop `assets/logo.png` + `assets/splash.png` in later and wire them via
  `app.json` to enable those.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - App launches to a navy splash, then renders with Montserrat headings /
    Raleway body and amber CTAs.
  - Home header shows STRIKE + "FISH. DATA. CONNECT." tagline; gear/stats/logbook
    buttons present.
  - Map markers and trip route are unchanged.
  - All screens (home, map, summary, catch, logbook, trip review, stats, privacy)
    render without crashes.

---

# STRIKE — Bite Map (Supabase, MVP)

Adds the **Bite Map**: an anonymous, zone-level community activity map of Als,
backed by Supabase. Privacy-first — the **zone_id is the most granular location
ever shared**; exact GPS and any user identifier never leave the device.

## New dependencies

| Package | Use |
| --- | --- |
| `@supabase/supabase-js` | Backend client (anonymous, no auth session) |
| `react-native-url-polyfill` | Required by supabase-js in React Native |

(`react-native-maps` was already present.)

## Config / safety

- **`.env` added to `.gitignore`** (plus `.env.local`).
- Supabase credentials are read from `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_KEY`. If absent, the client is `null` and the whole
  feature degrades gracefully (map still renders, nothing uploads).

## New files

- `services/supabase.ts` — typed anonymous client (`SupabaseClient<Database> |
  null`); `auth` session disabled. Exports `Database` / row / insert types for
  `bite_map_events`.
- `services/zones.ts` — the 9 hardcoded Als zones, `ALS_CENTER`,
  `detectZone(lat, lng)` (nearest zone center within **15 km**, else `null`),
  and `zoneName(id)`.
- `services/biteMap.ts`:
  - `uploadBiteMapEvent(event, zoneId, weather)` — anonymous insert of
    `{ zone_id, event_type, hour_of_day, date, wind_direction, water_temp }`.
    Triple-gated: Supabase configured **AND** `privacyLevel` is
    `area_only`/`public` **AND** the user opted in (`getBiteMapContribution`).
    Fire-and-forget, fails silently offline.
  - `getBiteMapData(hours: 24 | 168)` — groups events by zone into
    `{ zone_id, zone_name, catches, contacts, total }[]`, always returning all 9
    zones (zeroed when empty/offline).

## Wiring

- `store/useStrikeStore.ts` — after `addEvent` persists locally and captures
  weather, it calls `detectZone(...)` and, if a zone is found, fires
  `uploadBiteMapEvent(event, zoneId, state.weather)` in the background (`void`,
  never awaited). The opt-in + privacy checks live inside the upload, so it's
  safe to call for every event.
- `app/index.tsx` — added a **"Kort"** (`map-outline`) button to the home header
  → `/bitemap`. (Home round buttons trimmed to 48px / 8px gap to fit four
  actions.)

## New screen — `app/bitemap.tsx`

- Brand-styled (navy/teal/amber, theme fonts). Header "BITE MAP" + dynamic
  subtitle ("Aktivitet de seneste 24 timer" / "7 dage").
- **24 TIMER / 7 DAGE** toggle (amber active pill) → refetches.
- `react-native-maps` centered on Als with the 9 zones as **activity bubbles**
  showing the event count, colored by total: grey (0), green (1-3), yellow
  (4-8), red (9+). A small legend explains the scale.
- Tap a zone → info card: zone name + "X fangster · Y kontakter".
- **Pull-to-refresh**; empty state "Ingen aktivitet endnu. Vær den første!".
- **Privacy gate**: the map always shows; if contribution is off, a note appears
  — "Du bidrager ikke til Bite Map. Skift i indstillinger." — and nothing
  uploads.

## Privacy guarantees (by construction)

- Only `zone_id` + coarse context (event type, hour-of-day, date, wind compass,
  water temp) is sent — **never latitude/longitude**.
- No user id, device id, or trip id is included.
- Contacts/lost events default to `private`, so in practice only `area_only` /
  `public` **catches** are ever uploaded.

## Notes / decisions

- Map gestures are disabled on the Bite Map (static overview) so it coexists
  cleanly with the pull-to-refresh scroll view; zone markers stay tappable.
- The `Database` type is hand-written (Row/Insert/Update + `Relationships`/empty
  schema members) to satisfy supabase-js generics without codegen.
- "kontakter" will read 0 until/unless contacts are ever shared publicly (they're
  private by default) — the grouping logic already handles them for the future.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - Open **Kort** from home → Bite Map renders with 9 grey zone bubbles when
    empty; "Vær den første!" empty state shows.
  - Log an `area_only`/`public` catch inside an Als zone while opted in & online
    → a row appears in `bite_map_events`; the zone bubble increments on refresh.
  - Toggle 24 TIMER / 7 DAGE refetches; tapping a zone shows the count card.
  - With contribution off (privacy settings), the map still renders and the
    "Du bidrager ikke..." note shows; no upload occurs.

---

# STRIKE — Home & Active-Trip UI polish

Three focused UI improvements (no navigation or data-layer changes).

## 1. "Kort" moved out of the crowded header (`app/index.tsx`)

- Removed the 4th header button (map). The home header is back to **3 buttons**:
  gear (left), STRIKE title, stats + logbook (right). Restored the round buttons
  to 54px / 10px gap.
- Added a **Bite Map quick-access card** between the hero card and the action
  buttons: teal (`Colors.card`) rounded card, amber `map-outline` icon bubble,
  title "BITE MAP", subtitle "Se aktivitet i dit område", chevron → `/bitemap`.

## 2. New Catch promoted on the active-trip screen (`app/map.tsx`)

- Removed the unintuitive small fish icon from the header.
- Replaced the 2-button row with **three equal large buttons** in a row, each
  icon + label: **Contact** (amber, navy text), **Lost Fish** (red), **New
  Catch** (teal `cardElevated`, `camera-outline`, light text). New Catch → `/catch`.
- **Stop Trip** stays full-width below.

## 3. Atmosphere on the home hero (`app/index.tsx`)

- No coastal image asset exists, so per the brief the header now sits on a
  **edge-to-edge gradient banner** (`#12283A → #0D1B2A`) with rounded bottom
  corners and a **faint "wave" arc** (low-opacity muted-green ellipse) behind the
  wordmark. The STRIKE / FISH. DATA. CONNECT. text sits on top and stays fully
  readable (the backdrop is dark by construction).
- Implemented with `expo-linear-gradient` (already a dependency).

## Verification

- `npm run typecheck` → **passes after each change** (run 3×) and at the end.
- Brand colors/fonts unchanged; Bite Map upload logic untouched; navigation and
  data layer unchanged.
- Expected manual checks:
  - Home header shows 3 buttons; a "BITE MAP" card appears above the action
    buttons and opens `/bitemap`.
  - Active trip screen shows Contact / Lost Fish / New Catch as three equal
    buttons; New Catch opens the catch screen; Stop Trip full-width below.
  - Home header sits on a subtle gradient banner with a faint wave; text stays
    readable.

---

# STRIKE — Performance, privacy model, premium UI (4 changes)

Each change was typechecked independently.

## 1. Instant trip start (no GPS wait)

- `app/index.tsx` `beginTrip` no longer awaits `getCurrentPositionAsync` — it
  starts the trip from the last known location and navigates to `/map`
  immediately. Removed the now-unused `expo-location` import.
- `components/TripWatcher.tsx` acquires the first fix and watches at
  `Accuracy.Balanced` (faster than High) in the background.
- `components/TripMap.tsx` empty state now reads **"Henter position…"** while the
  first fix is pending. Result: tapping Start feels instant.

## 2. New privacy / contribution model ('zone' | 'exact')

- `PrivacyLevel` is now **`'zone' | 'exact'`** (removed `private`/`area_only`/
  `public`). Default everywhere is **`zone`**.
- **Migration v3** (`database/schema.ts`, `SCHEMA_VERSION` 2→3): existing rows
  `private`/`area_only` → `zone`, `public` → `exact`. Idempotent, data-safe.
- App-layer defaults updated: store `addEvent`/`addCatch`, `queries` row mapper
  & upsert, `preferences.getDefaultPrivacy`.
- Catch screen + privacy settings now offer **Zone** (default, 2x2 km heatmap)
  and **Exact spot** (shares precise lat/lng). Logbook badge: `zone` (amber pin)
  / `exact` (green globe).
- **Bite Map upload**: now uploads for *every* event when opted in (no private
  gate). `zone` sends zone_id only; `exact` adds `lat`/`lng`. Added optional
  `lat`/`lng` to the `BiteMapEventInsert`/`Row` types and the insert payload.

## 3. Premium home screen

- Hero header: richer **diagonal gradient** `#0D1B2A → #1B3A4B → #12283A` plus a
  soft **amber glow** behind the STRIKE wordmark (`heroGlow`).
- Weather card: elevated background, faint **amber rim** (inner-glow look),
  larger/bolder location (22px, weight 800), amber drop shadow.
- Cards (`hero`, `panel`, `kortCard`, weather) gain a subtle **amber shadow /
  elevation** for depth.
- The "Fast coastal logging" card is now a subtle **gradient** (`#1B3A4B →
  #142C3A`) instead of flat teal.
- More generous section spacing on home (`contentStyle` gap 22).

## 4. Action button hierarchy (home)

- `components/ActionButton.tsx` gains a **`compact`** variant (no 47% min width,
  shorter height, tighter type) so three can share a row equally.
- Home actions: **Start Fishing Trip** is a full-width amber primary on top;
  **Contact / Lost Fish / New Catch** sit below as three equal compact buttons
  (New Catch now uses the camera icon). Clear one-primary / three-secondary
  hierarchy. The active-trip screen layout (3 equal buttons) was already done.

## ⚠️ Supabase action required (exact spots)

The Bite Map `bite_map_events` table needs two **nullable** columns for exact
contributions to persist:

```sql
alter table bite_map_events add column lat double precision;
alter table bite_map_events add column lng double precision;
```

Until added, `zone` uploads work as before; `exact` inserts will fail silently
(caught, no crash) because the columns don't exist — so the data layer/app is
safe either way.

## Verification

- `npm run typecheck` → **passes after each of the 4 changes.**
- Brand colors preserved; navigation and Supabase upload paths intact;
  migration maps legacy data safely.

---

# STRIKE — Multi-language (Danish + English)

Adds full i18n with **Danish as default** (target market) and English fallback,
with a live in-app language switch.

## New dependencies

| Package | Use |
| --- | --- |
| `i18n-js` | Translation/interpolation engine |
| `expo-localization` | Detect device language on first launch |

## Architecture

- `i18n/index.ts` — sets up `i18n-js` (`enableFallback`, `defaultLocale = en`),
  detects device language (English → `en`, everything else → `da`), and holds
  the active locale in a small **Zustand store**. `useTranslation()` subscribes
  to that store, so **changing the language re-renders every screen live**. The
  chosen language is persisted to AsyncStorage (`strike.locale`) and restored on
  launch (overriding the device default).
- `i18n/en.json` + `i18n/da.json` — all user-facing strings, namespaced
  (`common`, `actions`, `events`, `metrics`, `weather`, `home`, `trip`, `catch`,
  `summary`, `logbook`, `stats`, `settings`, `bitemap`). Interpolation uses
  `{{var}}` (e.g. `"{{count}} fangster"`). Danish copy is hand-written for
  anglers (Start fisketur, Kontakt, Mistet fisk, Ny fangst, Stop tur, Hurtig
  registrering ved kysten, …).
- `tsconfig.json` — enabled `resolveJsonModule` for the translation imports.

## Wired screens/components

`app/index.tsx`, `app/map.tsx`, `app/catch.tsx`, `app/summary.tsx`,
`app/logbook.tsx`, `app/stats.tsx`, `app/privacy.tsx`, `app/bitemap.tsx`, and
`components/WeatherStrip.tsx` — every hardcoded string replaced with `t('…')`.
Module-scope option lists (catch & settings privacy options, stats time-of-day)
were refactored to translation keys resolved at render.

## Language toggle

`app/privacy.tsx` gains a **"Sprog / Language"** section at the top: a two-pill
selector (**Dansk** | **English**, amber active) wired to `setLocale`. Switching
updates the whole app immediately and persists.

## Decisions / notes

- **Default Danish**: non-English devices (incl. Danish) start in Danish; only
  English devices start in English; a saved choice always wins.
- **Species values stay canonical English** (`Sea trout`, …) because they are
  persisted to SQLite and shown across screens/stats — translating only the
  display would desync stored data. Only the **"Species"/"Art" label** is
  localized. (Easy follow-up: store a species key + translate for display.)
- **Brand strings kept**: the `STRIKE` wordmark and the `FISH. DATA. CONNECT.`
  tagline are identical in both languages; `BITE MAP` is treated as a brand name.
- Tide/wind text in the weather strip come from mock **data**, so they aren't
  localized (only the `air`/`water`/`sunrise`/pressure framing is).

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - Fresh install on a Danish/!en device → UI is Danish; English device → English.
  - Settings → toggle Dansk/English → all screens switch instantly; persists
    across app restart.

---

# STRIKE — Custom fonts (bulletproof, non-blocking)

Re-introduces the Montserrat + Raleway brand fonts — this time loaded as an
**optional enhancement that can never block or blank the app** (the earlier
attempt hung because rendering was gated on `fontsLoaded`).

## Dependencies

- `@expo-google-fonts/montserrat`, `@expo-google-fonts/raleway` (re-added).

## The key difference from last time (`app/_layout.tsx`)

- `useFonts({ ... })` is called but its `[loaded, error]` result is **ignored** —
  rendering is **never gated** on it.
- The native splash is hidden **immediately on mount** (`useEffect` → `hideAsync`),
  not on font load.
- There is **no loading screen / no early return**, so a blank or hung screen due
  to fonts is impossible. If fonts are ready they apply; otherwise the system
  font is used and the brand font swaps in when ready (a brief, harmless swap).
  `expo-font` caches the fonts, so later launches usually have them instantly.
- Fonts loaded: `Montserrat_700Bold`, `Montserrat_900Black`,
  `Montserrat_600SemiBold`, `Montserrat_500Medium`, `Raleway_400Regular`,
  `Raleway_500Medium`, `Raleway_600SemiBold`.

## theme/fonts.ts

Maps semantic keys to the loaded families. Both the new brand-named keys and the
legacy keys already used across the app are present, so no screen needed editing:

| Key | Family |
| --- | --- |
| `headingBlack` / `black` | Montserrat_900Black |
| `heading` | Montserrat_700Bold |
| `headingSemi` / `semibold` | Montserrat_600SemiBold |
| `headingMedium` / `medium` | Montserrat_500Medium |
| `body` | Raleway_400Regular |
| `bodyMedium` | Raleway_500Medium |
| `bodySemi` / `bodySemibold` | Raleway_600SemiBold |
| `bodyBold` | Raleway_600SemiBold (heaviest loaded Raleway weight) |

## Notes

- `bodyBold` maps to Raleway **600 SemiBold** because the task's load list has no
  Raleway 700 — pointing it at an unloaded 700 would silently fall back to the
  system font. If a true 700 bold is wanted later, add `Raleway_700Bold` to the
  `useFonts` call and repoint `bodyBold`.
- Headings now render in genuine Montserrat weights, so the earlier "system font
  is regular weight" caveat no longer applies.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - App opens immediately every launch — no blank/loading screen, even offline or
    with fonts uncached.
  - First launch may show a brief system-font → Montserrat/Raleway swap; later
    launches render branded immediately (cached).

---

# STRIKE — First-launch onboarding (3 slides)

A simple, brand-styled onboarding shown once on first launch.

## New file — `app/onboarding.tsx`

- Three swipeable slides (horizontal paging `ScrollView`), each: large amber
  Ionicon in a glowing circle, Montserrat-Black headline, Raleway description.
  - Slide 1 `navigate-circle-outline` — Track dine ture / Track your trips
  - Slide 2 `flash-outline` — Registrér aktivitet / Log activity
  - Slide 3 `map-outline` — Bite Map & privatliv / Bite Map & privacy
- **Dots** indicator (active dot widens to amber), **Spring over / Skip** top
  right, bottom amber button **Næste / Next** → advances, **Kom i gang /
  Get started** on the last slide.
- Navy diagonal gradient background, generous spacing, large type — friendly for
  40–60-year-old anglers. Fully translated (no hardcoded strings).
- Finishing or skipping calls `setOnboardingCompleted(true)` then
  `router.replace('/')`.

## First-launch wiring

- `database/preferences.ts` — `getOnboardingCompleted()` / `setOnboardingCompleted()`
  (flag key `strike.onboardingCompleted`, default `false`).
- `app/index.tsx` — on mount checks the flag: not completed → `router.replace('/onboarding')`;
  completed → render home. While the (fast, always-settling) check runs it shows
  a plain navy `bootGate` view — **never blank, never hangs** (errors fall through
  to showing home).

## Re-trigger from settings

- `app/privacy.tsx` — new **Introduction / Introduktion** section with a
  **Show intro again / Vis introduktion igen** button: clears the flag and pushes
  `/onboarding` (for testing/demo).

## Translations

- `onboarding.*` keys (skip, next, getStarted, 3× title/desc) and
  `settings.intro` / `settings.showIntro` added to both `da.json` and `en.json`,
  with natural Danish.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - Fresh install → onboarding appears; swipe/Next through 3 slides; Get started →
    home; relaunch → straight to home (flag respected).
  - Skip on any slide → home, flag set.
  - Settings → Show intro again → onboarding reappears.
  - Works in both languages; switching language updates onboarding text too.

---

# STRIKE — DMI water level (Kegnæs fyr)

Adds real-time water level and trend from the DMI Open Data API (station 06119,
Kegnæs fyr). No API key required. Fully offline-first: a failure or timeout
resolves to `null` and no pill is shown — the app never blocks.

## New file — `services/dmi.ts`

- `getWaterLevel(): Promise<WaterLevelData | null>` — OGC API Features / GeoJSON
  request for the last 3 hours of `sealev_dvr` readings from station `06119`.
- Response parsed as a `FeatureCollection`; `features[].properties.observed` +
  `value` extracted into `{ time, cm }[]` pairs.
- Trend computed by comparing the latest reading against the reading closest to
  one hour earlier. Delta >2 cm → `rising`; < −2 cm → `falling`; else `stable`.
- **15-minute module-level cache** avoids hammering the free API.
- **3-second `AbortController` timeout** — the app can never be stalled waiting
  for DMI.
- All errors (network, HTTP non-2xx, unexpected shape, timeout) are caught and
  return `null`.

## Store changes — `store/useStrikeStore.ts`

- `waterLevel: WaterLevelData | null` added to `StrikeState` (initial `null`).
- `refreshWaterLevel(): void` — fire-and-forget; calls `getWaterLevel()` and
  sets state only on a non-null result so stale UI data is never cleared.
- Called in `startTrip` (alongside `refreshWeather`) and in `hydrateStore` on
  app start.

## UI — `components/WeatherStrip.tsx`

- Reads `store.waterLevel`; appended after the other pills regardless of whether
  the Open-Meteo weather fetch succeeded.
- Pill: trend arrow icon (`arrow-up-outline` / `arrow-down-outline` /
  `remove-outline`) + `"{level} cm · {trendWord}"`.
- Omitted silently when `waterLevel === null`.

## UI — `app/catch.tsx`

- Reads `store.waterLevel`; the environmental row now renders if either
  `weather !== null` **or** `waterLevel !== null` (previously only shown when
  Open-Meteo data was available).
- Same pill style as WeatherStrip — icon + level + trend word.

## Translations — `i18n/en.json`, `i18n/da.json`

- `weather.waterLevel` — "Water level" / "Vandstand"
- `weather.rising` — "Rising" / "Stigende"
- `weather.falling` — "Falling" / "Faldende"
- `weather.stable` — "Stable" / "Stabil"

## Verification

- `npm run typecheck` → **passes, 0 errors.**

---

# STRIKE — Following Fish, privacy collapse, trip name suggestion, camera picker

Four founder-driven changes. Typechecked after each.

## Change 1 — Replace "Lost Fish" with "Following Fish"

- **Event type** `'lost'` removed; `'following'` added. `StrikeEventType` is now
  `"contact" | "following" | "catch"`.
- **Schema migration v4** (`database/schema.ts`): existing `lost` events become
  `contact` (a lost fish was already a contact). `SCHEMA_VERSION` bumped to 4.
- **Active trip screen** (`app/map.tsx`): three-button row is now **Contact**
  (amber) / **Following** (blue `#2F6F93`, eye icon) / **New Catch** (elevated
  card, camera icon).
- **Home quick-log** (`app/index.tsx`): same three buttons with `eye-outline`
  icon and `tone="blue"` for Following.
- **Summary** (`app/summary.tsx`) and **Trip review** (`app/trip/[id].tsx`):
  following events shown with blue color, eye icon, "Following" label.
- **Map markers** (`components/TripMap.tsx`): following → `#5AA9E6` (blue) pin.
- **i18n** (`i18n/en.json`, `i18n/da.json`): `events.following`, `actions.following`,
  `metrics.following` — EN "Following", DA "Følger".

## Change 2 — Remove exact spot from community sharing

- **Schema migration v4** (same step as above): any `exact` privacy_level becomes
  `zone`. Exact GPS is never contributed to the community.
- **Catch screen** (`app/catch.tsx`): no privacy selector — every catch is
  area-level only (automatic, silent).
- **Settings** (`app/privacy.tsx`): only the "Contribute to Bite Map" on/off
  toggle remains; default-privacy Zone/Exact selector removed.
- **Bite Map upload** (`services/biteMap.ts`): sends `zone_id` only, never
  `lat`/`lng`. No privacy gate beyond the opt-in toggle.
- Dead i18n keys `catch.exactTitle`, `catch.exactSub`, `settings.exact`,
  `settings.defaultPrivacy` left in JSON (safe, unused) to avoid churn.

## Change 3 — Auto-propose previous trip name at same location

- `app/index.tsx`: `suggestTripName(location, trips)` finds the most-recent
  completed trip whose start point is within **500 m** of the current GPS
  position and returns its title.
- `handleStartPress` pre-fills the name modal with the suggestion; the user can
  accept it or type a new name. Skip still generates a time-based title.

## Change 4 — "Take photo" option on New Catch

- `app/catch.tsx`: photo box now shows an **action sheet** (via `Alert.alert`)
  offering **Take photo** | **Choose from library** | **Cancel**.
  - `takePhoto()` requests camera permission then calls `launchCameraAsync`.
  - `pickFromLibrary()` calls `launchImageLibraryAsync` (unchanged from before).
  - `choosePhoto()` presents the sheet; the photo box `onPress` wires to it.
- Fixed two pre-existing bugs in the same function:
  - `Alert` was missing from the `react-native` import.
  - Photo box `onPress` was calling `pickPhoto` (undefined); corrected to
    `choosePhoto`.
- **i18n** — new keys in both locales:
  - `common.cancel` — EN "Cancel" / DA "Annuller"
  - `catch.takePhoto` — EN "Take photo" / DA "Tag billede"
  - `catch.chooseLibrary` — EN "Choose from library" / DA "Vælg fra bibliotek"

## Verification

- `npm run typecheck` → **passes after each change, 0 errors.**

---

# STRIKE — Value-first home redesign

Reorders the home screen to show **live data and personal insight first**,
instead of a marketing tagline. All data comes from existing services
(`statistics`, `biteMap`); no new backend.

## New order

Header → **TODAY card** → **Personal summary** (replaces the tagline hero) →
Weather → BITE MAP card → action buttons.

## TODAY insight card (new)

- Pulls `getBiteMapData(24)` and sums activity across zones.
- Shows **"{{count}} registreringer i dit område seneste 24t"** when there's
  community activity, plus **"Dine bedste forhold: {{wind}}"** when the user has a
  best wind direction in their stats (`catchesByWindDirection[0]`).
- Empty community data → **"Vær den første til at registrere aktivitet i dag."**
- Teal card with amber accent (amber rim + icon bubble + amber kicker) and shadow.

## Personal summary (replaces "Fast coastal logging" hero)

- With trips (`getStatistics()` non-null): **"Du har fisket {{count}} ture"**,
  **"{{catches}} fangster · {{contacts}} kontakter"** (amber), and a
  **"Bedste tidspunkt: {label} (HH:00–HH:00)"** line when available.
- Brand-new user (no completed trips): **"Klar til din første tur?"** + a short
  encouraging line.
- The active-trip live panel still takes this slot while a trip is running.

## Data loading

- `getStatistics()` + `getBiteMapData(24)` load in parallel via a `loadInsights`
  callback, run through `useFocusEffect` so they **refresh every time home gains
  focus** (e.g. returning from a trip). Subtle loading text ("Henter aktivitet…")
  — never blocks; failures are swallowed and the screen still renders.
- Empty states handled for new users (no stats → welcome) and no community data.

## Translations

- New `home.*` keys (todayKicker, insightsLoading, communityActivity, beFirst,
  bestConditions, summaryKicker, tripsCount, catchContactLine, bestTime,
  welcomeTitle, welcomeText) added to `da.json` + `en.json` with natural Danish.

## Notes

- "Best conditions" uses the **top wind direction** from stats
  (`catchesByWindDirection[0]`); stats store no wind *speed*, so only direction is
  shown (the task's `windSpeed` isn't available without a schema change).
- The old `home.heroTitle/heroText` keys remain in the JSON (now unused) — left in
  place to avoid churn; safe to prune later.

## Verification

- `npm run typecheck` → **passes, no errors.**
- Expected manual checks:
  - New user: TODAY shows community count or "Vær den første…"; summary shows
    "Klar til din første tur?".
  - Returning user: summary shows trips/catches/contacts + best time; values
    refresh after finishing a trip (focus refetch).
  - Both languages render correctly; switching updates instantly.

---

# STRIKE — GlassCard design system + premium UI (Home & Bite Map)

Introduces a glass-morphism component library and applies it to the Home and Bite
Map screens. **Zero changes to data fetching, store, navigation, or Supabase.**
Typecheck passed after each screen.

## New components

| File | What it does |
| --- | --- |
| `components/GlassCard.tsx` | Semi-transparent deep-teal card (`rgba(27,58,75,0.72)`), subtle light border, optional amber glow shadow (`glow` prop). `overflow:"hidden"` clips Pressable ripple to the card's border radius. |
| `components/MetricChip.tsx` | Small pill with an Ionicons icon + text label, built on `Colors.pill`. Replaces the hand-rolled pill `<View>` rows in WeatherStrip. |
| `components/ActivityMarker.tsx` | Map bubble for Bite Map zones. Color-codes count: grey (0), green (1-3), yellow (4-8), red (9+). `selected` prop adds a bright border ring. |
| `components/GradientLegend.tsx` | Four-segment color bar + labels (`0 / 1-3 / 4-8 / 9+`) replacing the LegendDot list on Bite Map. |
| `components/StatCard.tsx` | Thin wrapper: GlassCard + `padding:22`. Used on the Home screen summary cards. |

## New design tokens — `theme/colors.ts`

```ts
glassBg:      "rgba(27, 58, 75, 0.72)"   // card background
glassBorder:  "rgba(217, 218, 213, 0.15)" // hairline border
glowAmber:    "rgba(255, 186, 0, 0.24)"   // amber shadow color
activityNone: "#5A6B78"  // grey  (0 events)
activityLow:  "#4CAF7D"  // green (1-3)
activityMid:  "#F4C84F"  // yellow(4-8)
activityHigh: "#F45B5B"  // red   (9+)
```

## Home screen — `app/index.tsx`

- **TODAY card**: `<View>` → `<GlassCard glow>`.
- **Three summary hero/stats cards**: `<LinearGradient>` → `<StatCard>` (visual
  props stripped; layout-only styles kept).
- **BITE MAP shortcut card**: `<Pressable>` → `<GlassCard><Pressable>` with an
  inner `kortInner` style for the row layout. `overflow:"hidden"` on GlassCard
  clips the Pressable ripple cleanly.
- `LinearGradient` import kept (still used by the hero banner gradient at the top
  of the screen).

## Bite Map screen — `app/bitemap.tsx`

- **Toggle (24H/7D)**: `<View style={styles.toggleRow}>` → `<GlassCard
  style={styles.toggleControl}>`. New `toggleControl` style provides layout +
  borderRadius only; GlassCard supplies the glass visuals.
- **Zone markers**: hand-rolled `<View bubble>` + conditional colors replaced by
  `<ActivityMarker count={total} selected={selectedZoneId === zone.id} />`.
- **Zone detail popup**: `<View style={styles.infoCard}>` → `<GlassCard glow
  style={styles.infoCard}>`.
- **Empty state**: `<View style={styles.emptyCard}>` → `<GlassCard
  style={styles.emptyCard}>`.
- **Legend**: `<View style={styles.legend}> + LegendDot children` → `<GradientLegend
  />`.
- Dead code removed: `bubbleColor()`, `bubbleTextColor()` helpers; `LegendDot`
  local component; `bubble`, `bubbleSelected`, `bubbleText`, `legend`,
  `legendItem`, `legendDot`, `legendLabel`, `toggleRow` styles.
- `infoCard` + `emptyCard` styles stripped to layout-only (visual props now come
  from GlassCard).

## WeatherStrip — `components/WeatherStrip.tsx`

Updated directly (it's a component, not a screen) to use glass tokens and
MetricChip:
- `wrap` style: `backgroundColor: Colors.glassBg`, `borderColor:
  Colors.glassBorder`, amber glow shadow.
- Individual pill `<View>` rows replaced by `<MetricChip key={item.label}
  icon={item.icon} label={item.label} />`.

## Verification

- `npm run typecheck` → **passes after Home screen, passes after Bite Map screen,
  0 errors total.**

---

# STRIKE — Phase 1: Bottom tabs + Home overhaul

Introduces a 5-tab bottom navigator and redesigns the Home screen. **Zero data-layer changes.** Typecheck passes.

## Navigation — `app/(tabs)/`

Added `app/(tabs)/_layout.tsx` (Expo Router `Tabs` navigator). Five tabs, each mapping to an existing screen:

| Tab | Icon | Screen |
|---|---|---|
| Hjem | `home-outline` | `(tabs)/index.tsx` |
| Ture | `book-outline` | `(tabs)/logbook.tsx` |
| Bite Map | `map-outline` | `(tabs)/bitemap.tsx` |
| Statistik | `bar-chart-outline` | `(tabs)/stats.tsx` |
| Profil | `person-outline` | `(tabs)/privacy.tsx` |

Tab bar: navy background, amber active tint, Montserrat Medium labels, 1 px border-top.

Stack screens that sit **above** the tab bar (no tab bar visible): `catch.tsx`, `map.tsx`, `summary.tsx`, `trip/[id].tsx`, `onboarding.tsx`.

**Route audit** — `(tabs)` is a route *group* (parenthesised), so URLs are unchanged. Every `router.push`/`router.replace` in every screen was verified and still resolves correctly:
- `router.replace("/")` → `(tabs)/index.tsx` ✅
- `router.push("/logbook")` → `(tabs)/logbook.tsx` ✅
- `router.push("/map")`, `/catch`, `/summary`, `/trip/:id`, `/onboarding` → stack screens ✅

## New component — `components/SectionHeader.tsx`

Title (Montserrat Bold, 18 px) + optional right-side amber link (`Pressable` + `Raleway SemiBold 13 px`). Used for OVERBLIK, MILJØDATA, and SENESTE TURE sections.

## Home screen — `app/(tabs)/index.tsx`

Layout top→bottom:

1. **Header**: STRIKE logo + tagline (existing brand tokens) + notification bell (`notifications-outline`, no-op for now — placeholder for Phase 2).
2. **Primary CTA**: When no active trip → full-width amber `ActionButton` "Start tur". When active → three compact event buttons (Kontakt / Følger / Ny fangst) + full-width "Stop tur" danger button.
3. **OVERBLIK card**: `SectionHeader "OVERBLIK"` + a glass card containing:
   - `TripMap` (height 150, `interactive={false}`) showing the active trip or last completed trip, clipped by the card's `borderRadius + overflow:hidden`.
   - `MetricChip` row: distance, duration, water temp (when available), wind (when available).
4. **Counter row**: `GlassCard` with three columns (KONTAKTER / FØLGER / LANDET) from the same displayed trip. Counts are large Montserrat Black numerals.
5. **MILJØDATA**: `SectionHeader "MILJØDATA" → "Se detaljer" → /bitemap` + existing `WeatherStrip`.
6. **SENESTE TURE**: `SectionHeader "SENESTE TURE" → "Se alle" → /logbook` + last 3 trips as teal cards (name, date, catch/contact badge pills). Tapping → `/trip/:id`.
7. **Welcome state**: When no trips exist at all, shows a `StatCard` with welcome text instead of OVERBLIK + Counter.
8. **Trip name modal**: unchanged from before.

### Removed from old Home
- Diagonal `LinearGradient` hero banner (brand branding now in the simple header)
- BITE MAP shortcut card (accessible via Bite Map tab)
- Gear / Stats / Logbook header buttons (now in tab bar)
- Community TODAY card and personal stats summary (content trimmed to the new layout)

## i18n — new keys (both `da.json` + `en.json`)

```
common.seeDetails    "Se detaljer" / "See details"
common.seeAll        "Se alle" / "See all"
tabs.home            "Hjem" / "Home"
tabs.trips           "Ture" / "Trips"
tabs.biteMap         "Bite Map" / "Bite Map"
tabs.stats           "Statistik" / "Stats"
tabs.profile         "Profil" / "Profile"
home.overblik        "OVERBLIK" / "OVERBLIK"
home.miljoedata      "MILJØDATA" / "CONDITIONS"
home.senesteTure     "SENESTE TURE" / "RECENT TRIPS"
home.counter.contacts "KONTAKTER" / "CONTACTS"
home.counter.following "FØLGER" / "FOLLOWING"
home.counter.catches  "LANDET" / "LANDED"
```

## Verification

- `npm run typecheck` → **passes, 0 errors.**
- Onboarding hides the tab bar naturally (it is a root Stack screen, not a tab).
