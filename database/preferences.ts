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
  mapType: "strike.mapType",
  // Background-gap bookkeeping for the active trip. See getTripGapSeconds().
  tripBackgroundedAt: "strike.tripBackgroundedAt",
  tripGapSeconds: "strike.tripGapSeconds",
  /** Random per-install id attached to feedback. Reset by a data erasure. */
  localUserId: "strike.localUserId",
  /** Whether we have explained why the app needs a position. */
  locationPrimed: "strike.locationPrimed",
  /** Last unhandled render error, so the next feedback can carry it. */
  lastCrash: "strike.lastCrash"
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

// --- Background gap ---------------------------------------------------------

/**
 * STRIKE records a route only while it is on screen: there is no background
 * location permission in this build. So a trip where the angler pocketed the
 * phone for twenty minutes produces a distance that is simply wrong, and the
 * old behaviour was to show that number as though it were a measurement.
 *
 * These two keys turn a wrong number into an explained one. They live in
 * AsyncStorage rather than component state on purpose: the case that matters
 * is iOS killing a backgrounded app, which takes every in-memory counter with
 * it and is exactly when the gap is largest.
 */

/** Marks the moment the app left the foreground during an active trip. */
export async function markTripBackgrounded(at: Date = new Date()): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.tripBackgroundedAt, at.toISOString());
  } catch (error) {
    console.warn("[strike/prefs] markTripBackgrounded failed", error);
  }
}

/**
 * Closes an open background period and returns the new total for this trip.
 * Gaps under `minSeconds` are discarded: switching apps to check a text is not
 * a hole in the route, and counting it would put a banner on every trip.
 */
export async function closeTripGap(minSeconds = 60): Promise<number> {
  try {
    const [startedRaw, totalRaw] = await AsyncStorage.multiGet([
      KEYS.tripBackgroundedAt,
      KEYS.tripGapSeconds
    ]);
    const started = startedRaw[1];
    let total = Number(totalRaw[1] ?? 0);
    if (!Number.isFinite(total) || total < 0) total = 0;
    if (!started) return total;

    const elapsed = (Date.now() - new Date(started).getTime()) / 1000;
    // A negative or absurd value means the clock moved; ignore rather than
    // report a fourteen-hour gap because the phone crossed a timezone.
    if (Number.isFinite(elapsed) && elapsed >= minSeconds && elapsed < 24 * 3600) {
      total += Math.round(elapsed);
    }
    await AsyncStorage.multiSet([
      [KEYS.tripBackgroundedAt, ""],
      [KEYS.tripGapSeconds, String(total)]
    ]);
    return total;
  } catch (error) {
    console.warn("[strike/prefs] closeTripGap failed", error);
    return 0;
  }
}

/** Total seconds the app spent in the background during the current trip. */
export async function getTripGapSeconds(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.tripGapSeconds);
    const value = Number(raw ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Clears the counter. Called when a trip starts and after one is summarised. */
export async function resetTripGap(): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.tripBackgroundedAt, ""],
      [KEYS.tripGapSeconds, "0"]
    ]);
  } catch (error) {
    console.warn("[strike/prefs] resetTripGap failed", error);
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
  const KEY = KEYS.localUserId;
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const newId =
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);
  await AsyncStorage.setItem(KEY, newId);
  return newId;
}

export { KEYS as PREFERENCE_KEYS };

/**
 * Clears every key this module owns. Used by "delete all my data"; deliberately
 * enumerated rather than AsyncStorage.clear(), which would also wipe keys other
 * libraries keep in the same store.
 */
export async function clearAllPreferences(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch (error) {
    console.warn("[strike/prefs] clearAllPreferences failed", error);
  }
}

/** True once the app has explained why it needs location, before asking iOS. */
export async function hasPrimedLocation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEYS.locationPrimed)) === "true";
  } catch {
    return false;
  }
}

export async function markLocationPrimed(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.locationPrimed, "true");
  } catch (error) {
    console.warn("[strike/prefs] markLocationPrimed failed", error);
  }
}

/**
 * Keeps the last render crash so the feedback screen can offer to attach it.
 *
 * Without this a crash produces a "something went wrong" screen and vanishes:
 * the tester reports "it crashed" and there is nothing to work from. TestFlight
 * collects native crashes, but a caught JavaScript error is not one of those.
 */
export async function recordCrash(message: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEYS.lastCrash,
      JSON.stringify({ at: new Date().toISOString(), message: message.slice(0, 600) })
    );
  } catch {
    // If we cannot even store it, there is nothing further to try.
  }
}

export async function getLastCrash(): Promise<{ at: string; message: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.lastCrash);
    return raw ? (JSON.parse(raw) as { at: string; message: string }) : null;
  } catch {
    return null;
  }
}

export async function clearLastCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.lastCrash);
  } catch {
    // Best effort.
  }
}
