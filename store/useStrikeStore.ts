import { create } from "zustand";
import { enqueueWrite, getDb } from "@/database/db";
import {
  getActiveTrip,
  getCompletedTrips,
  saveTripWithEvents,
  upsertEvent,
  upsertTrip
} from "@/database/queries";
import { hasSeeded, loadAppState, markSeeded, saveAppState } from "@/database/preferences";
import {
  captureWeatherForEvent,
  fetchWeather,
  syncPendingWeather,
  type WeatherData
} from "@/services/weather";
import { uploadBiteMapEvent } from "@/services/biteMap";
import { detectZone } from "@/services/zones";
import { getWaterLevel, type WaterLevelData } from "@/services/dmi";

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type StrikeEventType = "contact" | "following" | "catch";

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
};

type StrikeState = {
  activeTrip: Trip | null;
  trips: Trip[];
  currentLocation: Coordinate | null;
  lastCompletedTripId: string | null;
  locationSource: "gps" | "mock";
  weather: WeatherData | null;
  waterLevel: WaterLevelData | null;
  refreshWeather: (position?: Coordinate) => void;
  refreshWaterLevel: () => void;
  startTrip: (position?: Coordinate, source?: "gps" | "mock", title?: string) => void;
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
  }) => StrikeEvent | null;
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
        species: "Sea trout",
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

export const useStrikeStore = create<StrikeState>((set, get) => ({
  activeTrip: null,
  trips: demoTrips,
  currentLocation: demoStart,
  lastCompletedTripId: null,
  locationSource: "mock",
  weather: null,
  waterLevel: null,
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
  startTrip: (position, source = "mock", title) => {
    const startPosition = position ?? get().currentLocation ?? demoStart;
    const startedAt = new Date();
    const tripTitle = title?.trim() || defaultTripTitle(startedAt);
    const trip: Trip = {
      id: `trip-${id()}`,
      title: tripTitle,
      startedAt: startedAt.toISOString(),
      route: [startPosition],
      events: [],
      distanceMeters: 0,
      steps: 0
    };
    set({
      activeTrip: trip,
      currentLocation: startPosition,
      locationSource: source,
      lastCompletedTripId: null
    });
    // Insert the trip row now so following route points / events have a parent.
    enqueueWrite((db) => upsertTrip(db, trip));
    persistAppState();
    // Pull real conditions for the start location into the home weather strip.
    get().refreshWeather(startPosition);
    get().refreshWaterLevel();
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

    // Persist the finished trip with its end time, final route, and all events.
    enqueueWrite((db) => saveTripWithEvents(db, completed));
    persistAppState();

    return completed;
  },
  setCurrentLocation: (position, source = "gps") => {
    set({ currentLocation: position, locationSource: source });
    persistAppState();
  },
  appendRoutePoint: (position, source = "gps") => {
    const state = get();
    const trip = state.activeTrip;
    if (!trip) {
      set({ currentLocation: position, locationSource: source });
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
      activeTrip: updatedTrip
    });
    // Keep the in-progress trip's route/distance current so it survives a restart.
    enqueueWrite((db) => upsertTrip(db, updatedTrip));
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
      ...details
    };

    set({
      activeTrip: {
        ...trip,
        events: [...trip.events, event]
      }
    });

    // Write the event (sync_status defaults to 'pending' for offline-first sync).
    enqueueWrite((db) => upsertEvent(db, trip.id, event));
    // Capture weather for this spot in the background. If offline this no-ops
    // and syncPendingWeather() back-fills it on the next online launch.
    void captureWeatherForEvent(event.id, event.position.latitude, event.position.longitude);

    // Bite Map: anonymously contribute area-level activity in the background.
    // detectZone returns null outside Als; uploadBiteMapEvent enforces the
    // opt-in gate and only ever sends the zone_id (never exact GPS).
    const zoneId = detectZone(event.position.latitude, event.position.longitude);
    if (zoneId !== null) {
      void uploadBiteMapEvent(event, zoneId, state.weather);
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
      weightKg: details.weightKg
    });
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
    currentLocation: state.currentLocation
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

    if (!(await hasSeeded())) {
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

    useStrikeStore.setState((state) => ({
      trips,
      // Don't clobber a trip the user may have started before hydration finished.
      activeTrip: state.activeTrip ?? active,
      currentLocation:
        state.activeTrip?.route.at(-1) ??
        active?.route.at(-1) ??
        appState.currentLocation ??
        state.currentLocation ??
        demoStart,
      locationSource: appState.locationSource ?? state.locationSource,
      lastCompletedTripId: appState.lastCompletedTripId ?? state.lastCompletedTripId
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
