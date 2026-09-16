import { create } from "zustand";
import { enqueueWrite, getDb } from "@/database/db";
import {
  deleteEvent,
  deleteTrip,
  getActiveTrip,
  getCompletedTrips,
  insertWeatherSnapshot,
  queueBiteMapDelete,
  renameTripInDb,
  saveTripWithEvents,
  updateTripLure,
  upsertEvent,
  upsertTrip,
  type WeatherSnapshot,
} from "@/database/queries";
import { hasSeeded, loadAppState, markSeeded, saveAppState } from "@/database/preferences";
import {
  fetchWeather,
  syncPendingWeather,
  type WeatherData
} from "@/services/weather";
import { deleteBiteMapEvents, flushBiteMapDeleteQueue, resyncBiteMapEvent, uploadBiteMapEvent } from "@/services/biteMap";
import { flushFeedbackQueue } from "@/services/feedback";
import { latLngToCell } from "@/services/hexGrid";
import { storeWeatherForEvent } from "@/services/weather";
import { getWaterLevel, type WaterLevelData } from "@/services/dmi";
import type { MapType } from "@/database/preferences";

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type StrikeEventType = "contact" | "following" | "catch" | "lure" | "photo";

export type StrikeEvent = {
  id: string;
  type: StrikeEventType;
  timestamp: string;
  position: Coordinate;
  photoUri?: string;
  species?: string;
  comment?: string;
  kept?: boolean;
  lengthCm?: number;
  weightKg?: number;
  lureId?: string;
};

export type Trip = {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  route: Coordinate[];
  events: StrikeEvent[];
  distanceMeters: number;
  steps: number;
  currentLureId?: string;
};

type StrikeState = {
  activeTrip: Trip | null;
  trips: Trip[];
  currentLocation: Coordinate | null;
  lastCompletedTripId: string | null;
  locationSource: "gps" | "mock";
  /**
   * True only after a real GPS fix has been received in this app session.
   * `locationSource` is not enough: startTrip() sets it to "gps" optimistically
   * before any fix exists, so it can claim "gps" while currentLocation is still
   * the demo start point. Anything that leaves the device (Activity Map upload,
   * reverse geocoding) must gate on this flag instead.
   */
  hasGpsFix: boolean;
  weather: WeatherData | null;
  waterLevel: WaterLevelData | null;
  mapType: MapType;
  recoveredStaleTrip: Trip | null;
  refreshWeather: (position?: Coordinate) => void;
  refreshWaterLevel: () => void;
  /**
   * True while the active trip still carries the name the app generated for it.
   * Set false the moment the user types a title, or once the place-based rename
   * has run — either way the title is then the user's or final, and nothing
   * overwrites it.
   */
  activeTripTitleIsAuto: boolean;
  startTrip: (position?: Coordinate, source?: "gps" | "mock", title?: string, lureId?: string, titleIsAuto?: boolean) => void;
  /** Rename the active trip, but only while its title is still auto-generated. */
  renameActiveTrip: (title: string) => void;
  setActiveLure: (lureId: string | null) => void;
  changeLure: (lureId: string | null, lureName: string) => void;
  stopTrip: () => Trip | null;
  setCurrentLocation: (position: Coordinate, source?: "gps" | "mock") => void;
  appendRoutePoint: (position: Coordinate, source?: "gps" | "mock") => void;
  addEvent: (type: StrikeEventType, details?: Partial<StrikeEvent>) => StrikeEvent | null;
  addCatch: (details: {
    photoUri?: string;
    species: string;
    comment: string;
    kept: boolean;
    position?: Coordinate;
    lengthCm?: number;
    weightKg?: number;
    lureId?: string;
  }) => StrikeEvent | null;
  setMapType: (type: MapType) => void;
  saveRecoveredTrip: () => void;
  discardRecoveredTrip: () => void;
  deleteCompletedTrip: (tripId: string) => void;
  removeEvent: (tripId: string, eventId: string) => void;
  renameTrip: (tripId: string, name: string) => void;
  updateEvent: (
    tripId: string,
    updatedEvent: StrikeEvent,
    opts?: {
      weatherPatch?: Partial<WeatherSnapshot>;
      existingWeather?: WeatherSnapshot | null;
      resyncBiteMap?: boolean;
    }
  ) => void;
};

const demoStart: Coordinate = {
  latitude: 55.2796,
  longitude: 12.4481
};

const demoTrips: Trip[] = [
  {
    id: "demo-1",
    title: "Stevns evening drift",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 27.4).toISOString(),
    distanceMeters: 3850,
    steps: 5200,
    route: [
      { latitude: 55.2796, longitude: 12.4481 },
      { latitude: 55.2805, longitude: 12.4512 },
      { latitude: 55.282, longitude: 12.4545 },
      { latitude: 55.2831, longitude: 12.4588 }
    ],
    events: [
      {
        id: "demo-event-1",
        type: "contact",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 29.2).toISOString(),
        position: { latitude: 55.2805, longitude: 12.4512 }
      },
      {
        id: "demo-event-2",
        type: "catch",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28.7).toISOString(),
        position: { latitude: 55.282, longitude: 12.4545 },
        species: "Havørred",
        comment: "Bright fish on a small tobisen fly.",
        kept: false
      }
    ]
  },
  {
    id: "demo-2",
    title: "Morning session",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 93.8).toISOString(),
    distanceMeters: 2920,
    steps: 4100,
    route: [
      { latitude: 55.4044, longitude: 11.3504 },
      { latitude: 55.4052, longitude: 11.353 },
      { latitude: 55.4067, longitude: 11.3564 }
    ],
    events: [
      {
        id: "demo-event-3",
        type: "following",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 94.8).toISOString(),
        position: { latitude: 55.4052, longitude: 11.353 }
      }
    ]
  }
];

const id = () => Math.random().toString(36).slice(2, 10);

const defaultTripTitle = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return "Morning session";
  }
  if (hour >= 17 && hour < 22) {
    return "Evening session";
  }
  return "Night session";
};

const distanceBetween = (a: Coordinate, b: Coordinate) => {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const fallbackPoint = (state: StrikeState) => {
  const last = state.activeTrip?.route.at(-1) ?? state.currentLocation ?? demoStart;
  const drift = state.activeTrip ? state.activeTrip.route.length * 0.00016 : 0;
  return {
    latitude: last.latitude + 0.00012 + drift * 0.08,
    longitude: last.longitude + 0.0002
  };
};

// ── Route-flush debounce ─────────────────────────────────────────────────────
// Writing the full route_json on every GPS point is expensive. Instead we
// schedule a flush every ROUTE_FLUSH_MS. On stopTrip we cancel the timer
// because saveTripWithEvents already does a final authoritative write.
const ROUTE_FLUSH_MS = 10_000;
const STALE_TRIP_MS = 12 * 60 * 60 * 1000;

let routeFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRouteFlush() {
  if (routeFlushTimer !== null) return; // timer already pending — let it fire
  routeFlushTimer = setTimeout(() => {
    routeFlushTimer = null;
    const trip = useStrikeStore.getState().activeTrip;
    if (trip) enqueueWrite((db) => upsertTrip(db, trip));
  }, ROUTE_FLUSH_MS);
}

function cancelRouteFlush() {
  if (routeFlushTimer !== null) {
    clearTimeout(routeFlushTimer);
    routeFlushTimer = null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export const useStrikeStore = create<StrikeState>((set, get) => ({
  activeTrip: null,
  // Demo trips are a development aid only — a fresh install must start empty.
  trips: __DEV__ ? demoTrips : [],
  currentLocation: demoStart,
  lastCompletedTripId: null,
  locationSource: "mock",
  hasGpsFix: false,
  activeTripTitleIsAuto: false,
  weather: null,
  waterLevel: null,
  mapType: "standard",
  recoveredStaleTrip: null,
  refreshWeather: (position) => {
    const target = position ?? get().currentLocation;
    if (!target) {
      return;
    }
    // Fire-and-forget; the UI is never blocked on the network.
    void fetchWeather(target.latitude, target.longitude).then((data) => {
      if (data) {
        set({ weather: data });
      }
    });
  },
  refreshWaterLevel: () => {
    // Fire-and-forget; cached for 15 min inside getWaterLevel().
    void getWaterLevel().then((data) => {
      if (data) {
        set({ waterLevel: data });
      }
    });
  },
  startTrip: (position, source = "mock", title, lureId, titleIsAuto = false) => {
    const startPosition = position ?? get().currentLocation ?? demoStart;
    const startedAt = new Date();
    const tripTitle = title?.trim() || defaultTripTitle(startedAt);
    const trip: Trip = {
      id: `trip-${id()}`,
      title: tripTitle,
      startedAt: startedAt.toISOString(),
      route: [],
      events: [],
      distanceMeters: 0,
      steps: 0,
      currentLureId: lureId
    };
    set({
      activeTrip: trip,
      currentLocation: startPosition,
      locationSource: source,
      lastCompletedTripId: null,
      activeTripTitleIsAuto: titleIsAuto
    });
    // Insert the trip row now so following route points / events have a parent.
    enqueueWrite((db) => upsertTrip(db, trip));
    persistAppState();
    // Pull real conditions for the start location into the home weather strip.
    get().refreshWeather(startPosition);
    get().refreshWaterLevel();
  },
  renameActiveTrip: (title) => {
    const state = get();
    const trip = state.activeTrip;
    const next = title.trim();
    if (!trip || !state.activeTripTitleIsAuto || !next || next === trip.title) return;
    const renamed = { ...trip, title: next };
    set({ activeTrip: renamed, activeTripTitleIsAuto: false });
    enqueueWrite((db) => upsertTrip(db, renamed));
    persistAppState();
  },
  stopTrip: () => {
    const activeTrip = get().activeTrip;
    if (!activeTrip) {
      return null;
    }

    const completed = {
      ...activeTrip,
      endedAt: new Date().toISOString()
    };

    set((state) => ({
      activeTrip: null,
      trips: [completed, ...state.trips],
      lastCompletedTripId: completed.id
    }));

    // Cancel any pending debounced flush — saveTripWithEvents is the final write.
    cancelRouteFlush();
    // Persist the finished trip with its end time, final route, and all events.
    enqueueWrite((db) => saveTripWithEvents(db, completed));
    persistAppState();

    return completed;
  },
  setCurrentLocation: (position, source = "gps") => {
    set({
      currentLocation: position,
      locationSource: source,
      ...(source === "gps" ? { hasGpsFix: true } : null)
    });
    persistAppState();
  },
  appendRoutePoint: (position, source = "gps") => {
    const state = get();
    const trip = state.activeTrip;
    if (!trip) {
      set({
        currentLocation: position,
        locationSource: source,
        ...(source === "gps" ? { hasGpsFix: true } : null)
      });
      persistAppState();
      return;
    }

    const previous = trip.route.at(-1);
    const addedDistance = previous ? distanceBetween(previous, position) : 0;
    const nextDistance = trip.distanceMeters + addedDistance;

    const updatedTrip: Trip = {
      ...trip,
      route: [...trip.route, position],
      distanceMeters: nextDistance,
      steps: Math.round(nextDistance * 1.34)
    };

    set({
      currentLocation: position,
      locationSource: source,
      activeTrip: updatedTrip,
      ...(source === "gps" ? { hasGpsFix: true } : null)
    });
    // Debounced flush: write the route to SQLite at most once every ROUTE_FLUSH_MS.
    // Individual events (contacts/catches) still write immediately via upsertEvent.
    scheduleRouteFlush();
  },
  addEvent: (type, details) => {
    const state = get();
    const trip = state.activeTrip;
    if (!trip) {
      return null;
    }

    const event: StrikeEvent = {
      id: `event-${id()}`,
      type,
      timestamp: new Date().toISOString(),
      position: details?.position ?? state.currentLocation ?? fallbackPoint(state),
      ...details,
      // Stamp the trip's active lure unless the caller explicitly supplies one.
      lureId: details?.lureId ?? trip.currentLureId
    };

    set({
      activeTrip: {
        ...trip,
        events: [...trip.events, event]
      }
    });

    // Compute the H3 cell once — used both for local storage and Bite Map upload.
    const h3Cell = latLngToCell(event.position.latitude, event.position.longitude);

    // Write the event (sync_status defaults to 'pending' for offline-first sync).
    enqueueWrite((db) => upsertEvent(db, trip.id, event, h3Cell));
    // Snapshot the already-fetched conditions — no extra API call. If weather
    // isn't available yet (offline start), syncPendingWeather() back-fills it.
    if (state.weather) {
      storeWeatherForEvent(event.id, state.weather);
    }

    // Activity Map: upload area-level activity — h3Cell only, never exact GPS.
    // Photo events are not activity signals; skip upload.
    // Events without a real GPS fix (permission denied, or logged before the
    // first fix lands) sit on the demo start point or a synthesised fallback.
    // Uploading those would put permanent phantom activity on the community map
    // roughly 100 km from Als, so they stay local-only.
    if (type !== "photo" && state.hasGpsFix) {
      void uploadBiteMapEvent(event, h3Cell, state.weather);
    }

    return event;
  },
  addCatch: (details) => {
    const state = get();
    return get().addEvent("catch", {
      photoUri: details.photoUri,
      species: details.species,
      comment: details.comment,
      kept: details.kept,
      position: details.position ?? state.currentLocation ?? fallbackPoint(state),
      lengthCm: details.lengthCm,
      weightKg: details.weightKg,
      lureId: details.lureId,
    });
  },
  setMapType: (type) => {
    set({ mapType: type });
    persistAppState();
  },
  saveRecoveredTrip: () => {
    const trip = get().recoveredStaleTrip;
    if (!trip) return;
    const completed: Trip = { ...trip, endedAt: trip.endedAt ?? new Date().toISOString() };
    set((state) => ({
      recoveredStaleTrip: null,
      trips: [completed, ...state.trips],
      lastCompletedTripId: completed.id
    }));
    enqueueWrite((db) => upsertTrip(db, completed));
    persistAppState();
  },
  discardRecoveredTrip: () => {
    const trip = get().recoveredStaleTrip;
    if (!trip) return;
    set({ recoveredStaleTrip: null });
    const eventIds = trip.events.map((e) => e.id);
    enqueueWrite(async (db) => {
      if (eventIds.length > 0) {
        try {
          await deleteBiteMapEvents(eventIds);
        } catch {
          await queueBiteMapDelete(db, eventIds);
        }
      }
      await deleteTrip(db, trip.id);
    });
  },
  deleteCompletedTrip: (tripId) => {
    const trip = get().trips.find((t) => t.id === tripId);
    if (!trip) return;
    set((state) => ({ trips: state.trips.filter((t) => t.id !== tripId) }));
    const eventIds = trip.events.map((e) => e.id);
    enqueueWrite(async (db) => {
      if (eventIds.length > 0) {
        try {
          await deleteBiteMapEvents(eventIds);
        } catch {
          await queueBiteMapDelete(db, eventIds);
        }
      }
      await deleteTrip(db, tripId);
    });
  },
  removeEvent: (tripId, eventId) => {
    set((state) => ({
      trips: state.trips.map((t) =>
        t.id !== tripId ? t : { ...t, events: t.events.filter((e) => e.id !== eventId) }
      )
    }));
    enqueueWrite(async (db) => {
      try {
        await deleteBiteMapEvents([eventId]);
      } catch {
        await queueBiteMapDelete(db, [eventId]);
      }
      await deleteEvent(db, eventId);
    });
  },
  renameTrip: (tripId, name) => {
    set((state) => ({
      trips: state.trips.map((t) => (t.id !== tripId ? t : { ...t, title: name }))
    }));
    enqueueWrite((db) => renameTripInDb(db, tripId, name));
  },
  updateEvent: (tripId, updatedEvent, opts) => {
    const updateInTrip = (trip: Trip): Trip =>
      trip.id === tripId
        ? { ...trip, events: trip.events.map((e) => e.id === updatedEvent.id ? updatedEvent : e) }
        : trip;
    set((state) => ({
      trips: state.trips.map(updateInTrip),
      activeTrip: state.activeTrip ? updateInTrip(state.activeTrip) : null,
    }));
    enqueueWrite(async (db) => {
      await upsertEvent(db, tripId, updatedEvent);
      if (opts?.weatherPatch && Object.keys(opts.weatherPatch).length > 0) {
        const snapshotId = opts.existingWeather?.id ?? `ws-${id()}`;
        await insertWeatherSnapshot(db, {
          id: snapshotId,
          eventId: updatedEvent.id,
          ...opts.weatherPatch,
        });
      }
      // "lure" and "photo" events are never activity signals and are never
      // uploaded by addEvent — resync must not smuggle them onto the map either.
      if (opts?.resyncBiteMap && updatedEvent.type !== "lure" && updatedEvent.type !== "photo") {
        const h3Cell = latLngToCell(updatedEvent.position.latitude, updatedEvent.position.longitude);
        const combinedWeather: WeatherSnapshot | null = opts.existingWeather
          ? { ...opts.existingWeather, ...opts.weatherPatch }
          : null;
        await resyncBiteMapEvent(updatedEvent, h3Cell, combinedWeather);
      }
    });
  },
  setActiveLure: (lureId) => {
    const trip = get().activeTrip;
    if (!trip) return;
    set({ activeTrip: { ...trip, currentLureId: lureId ?? undefined } });
    enqueueWrite((db) => updateTripLure(db, trip.id, lureId));
  },
  changeLure: (lureId, lureName) => {
    // Update current lure on the trip first, then log the switch as a timeline event.
    const trip = get().activeTrip;
    if (!trip) return;
    set({ activeTrip: { ...trip, currentLureId: lureId ?? undefined } });
    enqueueWrite((db) => updateTripLure(db, trip.id, lureId));
    get().addEvent("lure", { comment: lureName, lureId: lureId ?? undefined });
  }
}));

export const formatDuration = (startedAt: string, endedAt?: string) => {
  const elapsed = Math.max(0, (new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = Math.floor(elapsed % 60);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export const formatDistance = (meters: number) => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
};

// --- Persistence glue -------------------------------------------------------

/** Fire-and-forget write of the small app-state slice to AsyncStorage. */
function persistAppState() {
  const state = useStrikeStore.getState();
  void saveAppState({
    locationSource: state.locationSource,
    lastCompletedTripId: state.lastCompletedTripId,
    currentLocation: state.currentLocation,
    mapType: state.mapType
  });
}

let hydrated = false;

/**
 * Loads persisted data from SQLite/AsyncStorage into the store. Runs once on
 * app start. On first ever launch it seeds the demo trips so the experience is
 * identical to the previous in-memory build. An in-progress trip (closed mid
 * session) is restored into `activeTrip` so tracking resumes.
 */
export async function hydrateStore(): Promise<void> {
  if (hydrated) {
    return;
  }
  hydrated = true;

  try {
    const db = await getDb();
    void flushBiteMapDeleteQueue(db);
    void flushFeedbackQueue(db);

    // Seed demo trips in development only. A tester's first launch must show an
    // empty logbook and empty statistics — seeded trips off Stevns would look
    // like the app invented someone else's fishing and would skew their stats.
    if (__DEV__ && !(await hasSeeded())) {
      for (const trip of demoTrips) {
        await saveTripWithEvents(db, trip);
      }
      await markSeeded();
    }

    const [trips, active, appState] = await Promise.all([
      getCompletedTrips(db),
      getActiveTrip(db),
      loadAppState()
    ]);

    // A trip started >12 h ago was almost certainly abandoned. Don't silently
    // resume it — surface it as recoveredStaleTrip so the user can save or discard.
    const isStale =
      active != null &&
      Date.now() - new Date(active.startedAt).getTime() > STALE_TRIP_MS;

    useStrikeStore.setState((state) => ({
      trips,
      // Don't clobber a trip the user may have started before hydration finished.
      activeTrip: !isStale ? (state.activeTrip ?? active) : state.activeTrip,
      recoveredStaleTrip: isStale ? active : state.recoveredStaleTrip,
      currentLocation:
        state.activeTrip?.route.at(-1) ??
        (!isStale ? active?.route.at(-1) : null) ??
        appState.currentLocation ??
        state.currentLocation ??
        demoStart,
      locationSource: appState.locationSource ?? state.locationSource,
      lastCompletedTripId: appState.lastCompletedTripId ?? state.lastCompletedTripId,
      mapType: appState.mapType ?? state.mapType
    }));

    // Back-fill weather for any events captured offline, then refresh the strip
    // for the current location. Both are best-effort and offline-safe.
    void syncPendingWeather();
    useStrikeStore.getState().refreshWeather();
    useStrikeStore.getState().refreshWaterLevel();
  } catch (error) {
    console.warn("[strike/store] hydration failed", error);
  }
}

// Kick off hydration as soon as the store module is first imported.
void hydrateStore();
