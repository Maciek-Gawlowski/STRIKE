import { latLngToCell } from "@/services/hexGrid";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Coordinate, StrikeEvent, StrikeEventType, Trip } from "@/store/useStrikeStore";

/**
 * Data access layer. Everything that maps between the in-memory domain model
 * (Trip / StrikeEvent, used by the Zustand store and the screens) and the SQLite
 * rows lives here. The store never writes raw SQL.
 */

// --- Row shapes -------------------------------------------------------------

type TripRow = {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  distance: number;
  duration: number | null;
  steps: number;
  route_json: string;
  current_lure_id: string | null;
};

type EventRow = {
  id: string;
  trip_id: string;
  type: string;
  timestamp: string;
  lat: number;
  lng: number;
  photo_uri: string | null;
  species: string | null;
  comment: string | null;
  released: number | null;
  sync_status: string;
  privacy_level: string | null;
  length_cm: number | null;
  weight_kg: number | null;
  lure_id: string | null;
  h3_cell: string | null;
  coloration: string | null;
  is_kelt: number | null;
  is_greenlander: number | null;
  is_fin_clipped: number | null;
};

export type WeatherSnapshot = {
  id: string;
  eventId: string;
  airTemp?: number;
  waterTemp?: number;
  windSpeed?: number;
  windDirection?: string;
  pressure?: number;
  /** cm relative to DVR90. Only set when a live reading existed at event time. */
  waterLevel?: number;
  /** "rising" | "falling" | "stable" — the direction anglers actually ask about. */
  waterLevelTrend?: string;

  // Captured from the same two API calls as the fields above and stored whether
  // or not any screen shows them yet. Collecting is cheap and one-way: a
  // condition not asked for at the moment of the catch can only ever be
  // approximated afterwards from a coarser archive.
  apparentTemp?: number;
  humidity?: number;
  pressureMsl?: number;
  windGust?: number;
  cloudCover?: number;
  precipitation?: number;
  weatherCode?: number;
  isDay?: number;
  waveHeight?: number;
  waveDirection?: number;
  wavePeriod?: number;
  currentVelocity?: number;
  currentDirection?: number;
  seaLevelMsl?: number;
};

// --- Mappers ----------------------------------------------------------------

function parseRoute(routeJson: string): Coordinate[] {
  try {
    const parsed = JSON.parse(routeJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Optional boolean to SQLite's integer, keeping "not recorded" distinct from "no". */
function flag(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

/** The same distinction on the way back: NULL stays undefined, not false. */
function unflag(value: number | null): boolean | undefined {
  return value === null ? undefined : value === 1;
}

function rowToEvent(row: EventRow): StrikeEvent {
  // `released` is the inverse of the UI's `kept` flag. NULL means the event has
  // no kept/released semantics (contact / following).
  const kept = row.released === null ? undefined : row.released === 0;
  return {
    id: row.id,
    type: row.type as StrikeEventType,
    timestamp: row.timestamp,
    position: { latitude: row.lat, longitude: row.lng },
    photoUri: row.photo_uri ?? undefined,
    species: row.species ?? undefined,
    comment: row.comment ?? undefined,
    kept,
    lengthCm: row.length_cm ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    lureId: row.lure_id ?? undefined,
    coloration: (row.coloration as StrikeEvent["coloration"]) ?? undefined,
    isKelt: unflag(row.is_kelt),
    isGreenlander: unflag(row.is_greenlander),
    isFinClipped: unflag(row.is_fin_clipped),
  };
}

function rowToTrip(row: TripRow, events: StrikeEvent[]): Trip {
  return {
    id: row.id,
    title: row.name ?? "",
    startedAt: row.start_time,
    endedAt: row.end_time ?? undefined,
    route: parseRoute(row.route_json),
    events,
    distanceMeters: row.distance,
    steps: row.steps,
    currentLureId: row.current_lure_id ?? undefined
  };
}

function durationSeconds(trip: Trip): number | null {
  if (!trip.endedAt) {
    return null;
  }
  return Math.round((new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 1000);
}

function keptToReleased(kept: boolean | undefined): number | null {
  if (kept === undefined) {
    return null;
  }
  return kept ? 0 : 1;
}

// --- Trip writes ------------------------------------------------------------

/**
 * Inserts a trip or updates it in place. Uses ON CONFLICT ... DO UPDATE rather
 * than INSERT OR REPLACE so the existing row is never deleted (a REPLACE would
 * cascade-delete the trip's events).
 */
export async function upsertTrip(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.runAsync(
    `INSERT INTO trips (id, name, start_time, end_time, distance, duration, steps, route_json, current_lure_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       distance = excluded.distance,
       duration = excluded.duration,
       steps = excluded.steps,
       route_json = excluded.route_json,
       current_lure_id = excluded.current_lure_id;`,
    [
      trip.id,
      trip.title,
      trip.startedAt,
      trip.endedAt ?? null,
      trip.distanceMeters,
      durationSeconds(trip),
      trip.steps,
      JSON.stringify(trip.route),
      trip.currentLureId ?? null
    ]
  );
}

export async function updateTripLure(db: SQLiteDatabase, tripId: string, lureId: string | null): Promise<void> {
  await db.runAsync("UPDATE trips SET current_lure_id = ? WHERE id = ?;", [lureId, tripId]);
}

// --- Event writes -----------------------------------------------------------

export async function upsertEvent(
  db: SQLiteDatabase,
  tripId: string,
  event: StrikeEvent,
  h3Cell?: string,
  syncStatus: "pending" | "synced" = "pending"
): Promise<void> {
  const cell = h3Cell ?? latLngToCell(event.position.latitude, event.position.longitude);
  await db.runAsync(
    `INSERT INTO events (id, trip_id, type, timestamp, lat, lng, photo_uri, species, comment, released, sync_status, privacy_level, length_cm, weight_kg, lure_id, h3_cell, coloration, is_kelt, is_greenlander, is_fin_clipped)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       type = excluded.type,
       timestamp = excluded.timestamp,
       lat = excluded.lat,
       lng = excluded.lng,
       photo_uri = excluded.photo_uri,
       species = excluded.species,
       comment = excluded.comment,
       released = excluded.released,
       sync_status = excluded.sync_status,
       privacy_level = excluded.privacy_level,
       length_cm = excluded.length_cm,
       weight_kg = excluded.weight_kg,
       lure_id = excluded.lure_id,
       h3_cell = excluded.h3_cell,
       coloration = excluded.coloration,
       is_kelt = excluded.is_kelt,
       is_greenlander = excluded.is_greenlander,
       is_fin_clipped = excluded.is_fin_clipped;`,
    [
      event.id,
      tripId,
      event.type,
      event.timestamp,
      event.position.latitude,
      event.position.longitude,
      event.photoUri ?? null,
      event.species ?? null,
      event.comment ?? null,
      keptToReleased(event.kept),
      syncStatus,
      "zone",
      event.lengthCm ?? null,
      event.weightKg ?? null,
      event.lureId ?? null,
      cell,
      event.coloration ?? null,
      flag(event.isKelt),
      flag(event.isGreenlander),
      flag(event.isFinClipped),
    ]
  );
}

/**
 * Persists a complete trip and all of its events in a single transaction.
 * Used by stopTrip and by demo seeding.
 */
export async function saveTripWithEvents(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.withTransactionAsync(async () => {
    await upsertTrip(db, trip);
    for (const event of trip.events) {
      await upsertEvent(db, trip.id, event);
    }
  });
}

// --- Reads ------------------------------------------------------------------

async function getEventsForTrip(db: SQLiteDatabase, tripId: string): Promise<StrikeEvent[]> {
  const rows = await db.getAllAsync<EventRow>(
    "SELECT * FROM events WHERE trip_id = ? ORDER BY timestamp ASC;",
    [tripId]
  );
  return rows.map(rowToEvent);
}

async function hydrateTrip(db: SQLiteDatabase, row: TripRow): Promise<Trip> {
  const events = await getEventsForTrip(db, row.id);
  return rowToTrip(row, events);
}

/** Completed trips (end_time set), newest first — matches the in-memory order. */
export async function getCompletedTrips(db: SQLiteDatabase): Promise<Trip[]> {
  const rows = await db.getAllAsync<TripRow>(
    "SELECT * FROM trips WHERE end_time IS NOT NULL ORDER BY start_time DESC;"
  );
  return Promise.all(rows.map((row) => hydrateTrip(db, row)));
}

/** The single in-progress trip (no end_time), if the app was closed mid-trip. */
export async function getActiveTrip(db: SQLiteDatabase): Promise<Trip | null> {
  const row = await db.getFirstAsync<TripRow>(
    "SELECT * FROM trips WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1;"
  );
  return row ? hydrateTrip(db, row) : null;
}

export async function deleteTrip(db: SQLiteDatabase, tripId: string): Promise<void> {
  // ON DELETE CASCADE on events + weather_snapshots handles child rows.
  await db.runAsync("DELETE FROM trips WHERE id = ?;", [tripId]);
}

export async function deleteEvent(db: SQLiteDatabase, eventId: string): Promise<void> {
  // ON DELETE CASCADE on weather_snapshots handles the child row.
  await db.runAsync("DELETE FROM events WHERE id = ?;", [eventId]);
}

export async function renameTripInDb(db: SQLiteDatabase, tripId: string, name: string): Promise<void> {
  await db.runAsync("UPDATE trips SET name = ? WHERE id = ?;", [name, tripId]);
}

export async function queueBiteMapDelete(db: SQLiteDatabase, eventIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const eventId of eventIds) {
    await db.runAsync(
      "INSERT OR IGNORE INTO bite_map_delete_queue (local_event_id, queued_at) VALUES (?, ?);",
      [eventId, now]
    );
  }
}

export async function getBiteMapDeleteQueue(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ local_event_id: string }>(
    "SELECT local_event_id FROM bite_map_delete_queue;"
  );
  return rows.map((r) => r.local_event_id);
}

export async function clearBiteMapDeleteQueue(db: SQLiteDatabase, eventIds: string[]): Promise<void> {
  for (const eventId of eventIds) {
    await db.runAsync("DELETE FROM bite_map_delete_queue WHERE local_event_id = ?;", [eventId]);
  }
}

// --- Feedback queue ---------------------------------------------------------

export type FeedbackData = {
  id: string;
  message: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  deviceModel: string;
  localUserId: string;
};

export async function queueFeedback(db: SQLiteDatabase, row: FeedbackData): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO feedback_queue
       (id, message, app_version, build_number, platform, device_model, local_user_id, queued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [row.id, row.message, row.appVersion, row.buildNumber, row.platform, row.deviceModel, row.localUserId, new Date().toISOString()]
  );
}

export async function getFeedbackQueue(db: SQLiteDatabase): Promise<FeedbackData[]> {
  const rows = await db.getAllAsync<{
    id: string;
    message: string;
    app_version: string;
    build_number: string;
    platform: string;
    device_model: string;
    local_user_id: string;
  }>("SELECT * FROM feedback_queue;");
  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    appVersion: r.app_version,
    buildNumber: r.build_number,
    platform: r.platform,
    deviceModel: r.device_model,
    localUserId: r.local_user_id
  }));
}

export async function clearFeedbackQueueItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM feedback_queue WHERE id = ?;", [id]);
}

export async function countTrips(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM trips;");
  return row?.count ?? 0;
}

// --- Offline sync scaffolding (not connected yet) ---------------------------

/** Events still waiting to be pushed to the backend. */
export async function getPendingEvents(db: SQLiteDatabase): Promise<StrikeEvent[]> {
  const rows = await db.getAllAsync<EventRow>(
    "SELECT * FROM events WHERE sync_status = 'pending' ORDER BY timestamp ASC;"
  );
  return rows.map(rowToEvent);
}

export async function markEventSynced(db: SQLiteDatabase, eventId: string): Promise<void> {
  await db.runAsync("UPDATE events SET sync_status = 'synced' WHERE id = ?;", [eventId]);
}

export type EventLocation = {
  id: string;
  latitude: number;
  longitude: number;
};

export type OwnEvent = {
  id: string;
  type: StrikeEventType;
  latitude: number;
  longitude: number;
  timestamp: string;
};

/**
 * The user's own positioned events, for the personal layer on the Activity
 * Map. Nothing here touches the network: these rows have always lived on the
 * phone. The shared layer deliberately needs several anglers in a cell before
 * it draws anything, which is the right call for privacy but leaves a new
 * tester staring at an empty map and concluding the app is broken. Their own
 * catches are theirs to see from the first trip.
 *
 * Only positioned event types are returned — a lure change or a photo is not
 * a place where something happened.
 */
export async function getOwnEventsInWindow(
  db: SQLiteDatabase,
  since: string,
  until?: string | null
): Promise<OwnEvent[]> {
  const rows = await db.getAllAsync<{
    id: string;
    type: string;
    lat: number;
    lng: number;
    timestamp: string;
  }>(
    `SELECT id, type, lat, lng, timestamp
     FROM events
     WHERE type IN ('catch', 'contact', 'following')
       AND timestamp >= ?
       AND (? IS NULL OR timestamp <= ?)
     ORDER BY timestamp DESC
     LIMIT 300;`,
    // `until` is bound twice rather than using a numbered placeholder: mixing
    // `?` and `?2` in one statement is legal SQLite but easy to misread and
    // easy to break when the WHERE clause changes.
    [since, until ?? null, until ?? null]
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type as StrikeEventType,
    latitude: row.lat,
    longitude: row.lng,
    timestamp: row.timestamp
  }));
}

/**
 * Events that have no weather snapshot yet (e.g. created while offline).
 * Used by the background weather sync to back-fill conditions once online.
 */
export async function getEventsMissingWeather(db: SQLiteDatabase): Promise<EventLocation[]> {
  const rows = await db.getAllAsync<{ id: string; lat: number; lng: number }>(
    `SELECT e.id AS id, e.lat AS lat, e.lng AS lng
     FROM events e
     LEFT JOIN weather_snapshots w ON w.event_id = e.id
     WHERE w.id IS NULL
     ORDER BY e.timestamp ASC;`
  );
  return rows.map((row) => ({ id: row.id, latitude: row.lat, longitude: row.lng }));
}

// --- Weather snapshots (schema present; reserved for future weather capture) -

export async function insertWeatherSnapshot(
  db: SQLiteDatabase,
  snapshot: WeatherSnapshot
): Promise<void> {
  await db.runAsync(
    `INSERT INTO weather_snapshots (
       id, event_id, air_temp, water_temp, wind_speed, wind_direction, pressure,
       water_level, water_level_trend,
       apparent_temp, humidity, pressure_msl, wind_gust, cloud_cover,
       precipitation, weather_code, is_day,
       wave_height, wave_direction, wave_period,
       current_velocity, current_direction, sea_level_msl
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       event_id = excluded.event_id,
       air_temp = excluded.air_temp,
       water_temp = excluded.water_temp,
       wind_speed = excluded.wind_speed,
       wind_direction = excluded.wind_direction,
       pressure = excluded.pressure,
       -- Never overwrite a real reading with the null a later back-fill carries.
       water_level = COALESCE(excluded.water_level, water_level),
       water_level_trend = COALESCE(excluded.water_level_trend, water_level_trend),
       apparent_temp = COALESCE(excluded.apparent_temp, apparent_temp),
       humidity = COALESCE(excluded.humidity, humidity),
       pressure_msl = COALESCE(excluded.pressure_msl, pressure_msl),
       wind_gust = COALESCE(excluded.wind_gust, wind_gust),
       cloud_cover = COALESCE(excluded.cloud_cover, cloud_cover),
       precipitation = COALESCE(excluded.precipitation, precipitation),
       weather_code = COALESCE(excluded.weather_code, weather_code),
       is_day = COALESCE(excluded.is_day, is_day),
       wave_height = COALESCE(excluded.wave_height, wave_height),
       wave_direction = COALESCE(excluded.wave_direction, wave_direction),
       wave_period = COALESCE(excluded.wave_period, wave_period),
       current_velocity = COALESCE(excluded.current_velocity, current_velocity),
       current_direction = COALESCE(excluded.current_direction, current_direction),
       sea_level_msl = COALESCE(excluded.sea_level_msl, sea_level_msl);`,
    [
      snapshot.id,
      snapshot.eventId,
      snapshot.airTemp ?? null,
      snapshot.waterTemp ?? null,
      snapshot.windSpeed ?? null,
      snapshot.windDirection ?? null,
      snapshot.pressure ?? null,
      snapshot.waterLevel ?? null,
      snapshot.waterLevelTrend ?? null,
      snapshot.apparentTemp ?? null,
      snapshot.humidity ?? null,
      snapshot.pressureMsl ?? null,
      snapshot.windGust ?? null,
      snapshot.cloudCover ?? null,
      snapshot.precipitation ?? null,
      snapshot.weatherCode ?? null,
      snapshot.isDay ?? null,
      snapshot.waveHeight ?? null,
      snapshot.waveDirection ?? null,
      snapshot.wavePeriod ?? null,
      snapshot.currentVelocity ?? null,
      snapshot.currentDirection ?? null,
      snapshot.seaLevelMsl ?? null
    ]
  );
}

export async function getWeatherForEvent(
  db: SQLiteDatabase,
  eventId: string
): Promise<WeatherSnapshot | null> {
  const row = await db.getFirstAsync<{
    id: string;
    event_id: string;
    air_temp: number | null;
    water_temp: number | null;
    wind_speed: number | null;
    wind_direction: string | null;
    pressure: number | null;
    water_level: number | null;
    water_level_trend: string | null;
    apparent_temp: number | null;
    humidity: number | null;
    pressure_msl: number | null;
    wind_gust: number | null;
    cloud_cover: number | null;
    precipitation: number | null;
    weather_code: number | null;
    is_day: number | null;
    wave_height: number | null;
    wave_direction: number | null;
    wave_period: number | null;
    current_velocity: number | null;
    current_direction: number | null;
    sea_level_msl: number | null;
  }>("SELECT * FROM weather_snapshots WHERE event_id = ? LIMIT 1;", [eventId]);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    eventId: row.event_id,
    airTemp: row.air_temp ?? undefined,
    waterTemp: row.water_temp ?? undefined,
    windSpeed: row.wind_speed ?? undefined,
    windDirection: row.wind_direction ?? undefined,
    pressure: row.pressure ?? undefined,
    waterLevel: row.water_level ?? undefined,
    waterLevelTrend: row.water_level_trend ?? undefined,
    apparentTemp: row.apparent_temp ?? undefined,
    humidity: row.humidity ?? undefined,
    pressureMsl: row.pressure_msl ?? undefined,
    windGust: row.wind_gust ?? undefined,
    cloudCover: row.cloud_cover ?? undefined,
    precipitation: row.precipitation ?? undefined,
    weatherCode: row.weather_code ?? undefined,
    isDay: row.is_day ?? undefined,
    waveHeight: row.wave_height ?? undefined,
    waveDirection: row.wave_direction ?? undefined,
    wavePeriod: row.wave_period ?? undefined,
    currentVelocity: row.current_velocity ?? undefined,
    currentDirection: row.current_direction ?? undefined,
    seaLevelMsl: row.sea_level_msl ?? undefined
  };
}

// --- Erasure ----------------------------------------------------------------

/**
 * Wipes every row the app has stored locally.
 *
 * Deliberately not "DROP TABLE": the schema and its migration version stay
 * put, so the app keeps working afterwards instead of needing a restart.
 *
 * The caller must have already withdrawn the server-side observations — see
 * eraseAllData() in the store. Once these rows are gone their local_event_ids
 * are gone with them, and nothing can identify those rows on the server again.
 */
export async function eraseAllLocalData(db: SQLiteDatabase): Promise<void> {
  // Every table the app owns. Enumerated rather than discovered, so adding a
  // table forces a decision here instead of quietly surviving an erasure — a
  // delete button that leaves data behind is worse than no delete button.
  // Children first: events reference trips, snapshots reference events.
  await db.execAsync(`
    DELETE FROM weather_snapshots;
    DELETE FROM events;
    DELETE FROM trips;
    DELETE FROM bite_map_delete_queue;
    DELETE FROM feedback_queue;
    DELETE FROM spots;
    DELETE FROM lures;
    DELETE FROM profile;
  `);
}
