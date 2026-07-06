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
  biteMapContribution: "strike.biteMapContribution",
  onboardingCompleted: "strike.onboardingCompleted"
} as const;

export type PersistedAppState = {
  locationSource: "gps" | "mock";
  lastCompletedTripId: string | null;
  currentLocation: Coordinate | null;
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
  const [source, lastTripId, location] = await AsyncStorage.multiGet([
    KEYS.locationSource,
    KEYS.lastCompletedTripId,
    KEYS.currentLocation
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

  return result;
}

/** Persists the app-state slice. Best-effort; failures are swallowed. */
export async function saveAppState(state: PersistedAppState): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.locationSource, state.locationSource],
      [KEYS.lastCompletedTripId, state.lastCompletedTripId ?? ""],
      [KEYS.currentLocation, state.currentLocation ? JSON.stringify(state.currentLocation) : ""]
    ]);
  } catch (error) {
    console.warn("[strike/prefs] saveAppState failed", error);
  }
}

// --- Bite Map sharing preference --------------------------------------------

/** Whether the user contributes anonymous activity to the Bite Map. Default on. */
export async function getBiteMapContribution(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.biteMapContribution);
  // Default to true when unset; only an explicit "false" turns it off.
  return value !== "false";
}

export async function setBiteMapContribution(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.biteMapContribution, enabled ? "true" : "false");
  } catch (error) {
    console.warn("[strike/prefs] setBiteMapContribution failed", error);
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

export { KEYS as PREFERENCE_KEYS };
