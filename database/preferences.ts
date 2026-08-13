import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Coordinate } from "@/store/useStrikeStore";

/**
 * Lightweight key/value app state + user preferences, persisted with
 * AsyncStorage. SQLite holds the structured trip/event records; AsyncStorage
 * holds the small, flat bits of UI/app state that the store restores on launch.
 */

const KEYS = {
  seeded: "strike.seeded",
  locationSource: "strike.locationSource",
  lastCompletedTripId: "strike.lastCompletedTripId",
  currentLocation: "strike.currentLocation",
  onboardingCompleted: "strike.onboardingCompleted",
  mapType: "strike.mapType"
} as const;

export type MapType = "standard" | "satellite" | "hybrid";

export type PersistedAppState = {
  locationSource: "gps" | "mock";
  lastCompletedTripId: string | null;
  currentLocation: Coordinate | null;
  mapType: MapType;
};

/** True once the one-time demo data has been written to SQLite. */
export async function hasSeeded(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.seeded)) === "true";
}

export async function markSeeded(): Promise<void> {
  await AsyncStorage.setItem(KEYS.seeded, "true");
}

/** Reads the persisted app-state slice; missing/corrupt values fall back. */
export async function loadAppState(): Promise<Partial<PersistedAppState>> {
  const [source, lastTripId, location, mapType] = await AsyncStorage.multiGet([
    KEYS.locationSource,
    KEYS.lastCompletedTripId,
    KEYS.currentLocation,
    KEYS.mapType
  ]);

  const result: Partial<PersistedAppState> = {};

  const sourceValue = source[1];
  if (sourceValue === "gps" || sourceValue === "mock") {
    result.locationSource = sourceValue;
  }

  if (lastTripId[1]) {
    result.lastCompletedTripId = lastTripId[1];
  }

  if (location[1]) {
    try {
      const parsed = JSON.parse(location[1]) as Coordinate;
      if (typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number") {
        result.currentLocation = parsed;
      }
    } catch {
      // ignore malformed cache
    }
  }

  const mt = mapType[1];
  if (mt === "satellite" || mt === "hybrid" || mt === "standard") {
    result.mapType = mt;
  }

  return result;
}

/** Persists the app-state slice. Best-effort; failures are swallowed. */
export async function saveAppState(state: PersistedAppState): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.locationSource, state.locationSource],
      [KEYS.lastCompletedTripId, state.lastCompletedTripId ?? ""],
      [KEYS.currentLocation, state.currentLocation ? JSON.stringify(state.currentLocation) : ""],
      [KEYS.mapType, state.mapType ?? "standard"]
    ]);
  } catch (error) {
    console.warn("[strike/prefs] saveAppState failed", error);
  }
}

// --- Onboarding -------------------------------------------------------------

/** Whether the first-launch onboarding flow has been completed. Default false. */
export async function getOnboardingCompleted(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.onboardingCompleted);
  return value === "true";
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.onboardingCompleted, completed ? "true" : "false");
  } catch (error) {
    console.warn("[strike/prefs] setOnboardingCompleted failed", error);
  }
}

// --- Local user identity (alpha tester correlation, not account identity) ----

/**
 * Returns a stable per-install random ID. Generated once and persisted in
 * AsyncStorage. This is NOT a user account identifier — it exists only to let
 * alpha testers correlate multiple feedback submissions from the same device.
 */
export async function getOrCreateLocalUserId(): Promise<string> {
  const KEY = "strike.localUserId";
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const newId =
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);
  await AsyncStorage.setItem(KEY, newId);
  return newId;
}

export { KEYS as PREFERENCE_KEYS };
