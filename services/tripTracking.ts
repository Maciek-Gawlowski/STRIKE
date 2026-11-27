import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { checkZones } from "@/services/zoneAlerts";
import { useStrikeStore } from "@/store/useStrikeStore";

/**
 * Everything between "the phone reported a position" and "it is on the
 * route": the background location task, the position filter, and the hand-off
 * to the zone check.
 *
 * Why a background task at all. Until build 53 the route was recorded by
 * watchPositionAsync, which iOS stops the moment the screen locks. Anglers
 * fish with the phone in a pocket, so a trip came back with holes, and the
 * protection-zone warning — the feature Claus called the most important on a
 * trip — only fired once the phone was unlocked again. Now the route is
 * recorded by a location task that keeps running in the background while a
 * trip is active, with the blue location indicator showing.
 *
 * It needs only "While Using" permission, not "Always": iOS lets an app that
 * started location updates in the foreground keep them in the background, as
 * long as it declares the background mode and shows the indicator. We never
 * ask for "Always". Outside a trip nothing runs.
 */

export const TRIP_LOCATION_TASK = "strike-trip-location";

/**
 * Position filtering.
 *
 * A tester on Barsø logged a six-hour trip whose route shot off the island
 * and back twice. Nothing was wrong with the GPS: on a small island the
 * satellite fix drops and iOS falls back to a cell-tower estimate, which it
 * reports as a position like any other — just with an accuracy of several
 * kilometres. The app wrote every one of them into the route.
 *
 * Two independent guards, because each catches what the other misses.
 *
 * MAX_ACCURACY_M throws away fixes the phone itself admits are vague. Most
 * jumps announce themselves this way.
 *
 * MAX_SPEED_MPS catches the ones that lie. A fix can claim good accuracy and
 * still be wrong; what it cannot do is be two kilometres from the last one a
 * few seconds later. 15 m/s is 54 km/h — faster than anyone walking a shore
 * or running a small boat, slow enough that a real crossing still registers.
 */
const MAX_ACCURACY_M = 50;
const MAX_SPEED_MPS = 15;

/**
 * How long the accuracy guard may starve the route before it yields.
 *
 * 50 m is right for someone on an open shore, but it is a guess about every
 * other place people fish — under a cliff, in trees, in heavy rain. If that
 * guess is wrong the app records nothing at all, which is a worse bug than
 * the one being fixed and looks identical to a short walk.
 *
 * So after a minute with nothing accepted, the next fix goes in regardless of
 * what the phone says about its accuracy. The speed guard still applies, and
 * it is the one that actually stops the island jumps. This only loosens
 * precision, never plausibility.
 */
const ACCURACY_STARVATION_MS = 60 * 1000;

/** Metres between two coordinates. Equirectangular is plenty at these distances. */
function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const latRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dx = (b.longitude - a.longitude) * 111320 * Math.cos(latRad);
  const dy = (b.latitude - a.latitude) * 111132;
  return Math.hypot(dx, dy);
}

/** Last fix we trusted, for the speed check — per trip. */
let filterTripId: string | null = null;
let lastAccepted: { latitude: number; longitude: number; at: number } | null = null;

/**
 * Writes a fix to the active trip's route if it survives both guards, then
 * runs the zone check on it. Returns whether it was accepted.
 *
 * Rejections are logged rather than swallowed. A route quietly missing half
 * its points looks exactly like a short walk, and that is how this class of
 * bug stays invisible for weeks.
 *
 * `alwaysAccept` skips the accuracy guard. Used for the opening fix only,
 * which is fetched at Balanced accuracy (~100 m on iOS) and would fail the
 * 50 m test every time. Without it there is no first point, so no route, no
 * trip name, and nothing for the speed guard to measure against.
 */
export function ingestPosition(position: Location.LocationObject, label: string, alwaysAccept = false): boolean {
  const store = useStrikeStore.getState();
  const tripId = store.activeTrip?.id;
  if (!tripId) return false;
  if (tripId !== filterTripId) {
    filterTripId = tripId;
    lastAccepted = null;
  }

  const { latitude, longitude, accuracy } = position.coords;
  const at = position.timestamp ?? Date.now();

  // Batches can repeat or reorder a fix; a point older than the last one
  // would draw the route backwards.
  if (lastAccepted && at <= lastAccepted.at) return false;

  const starving = alwaysAccept || (lastAccepted != null && at - lastAccepted.at > ACCURACY_STARVATION_MS);

  if (accuracy != null && accuracy > MAX_ACCURACY_M && !starving) {
    console.warn(`[strike/gps] ${label} rejected — accuracy ${Math.round(accuracy)} m`);
    return false;
  }

  if (starving && !alwaysAccept && accuracy != null && accuracy > MAX_ACCURACY_M) {
    console.warn(`[strike/gps] ${label} accepted at ${Math.round(accuracy)} m — nothing better for 60 s`);
  }

  if (lastAccepted) {
    const seconds = Math.max((at - lastAccepted.at) / 1000, 0.001);
    const distance = metresBetween(lastAccepted, { latitude, longitude });
    const speed = distance / seconds;
    if (speed > MAX_SPEED_MPS) {
      console.warn(
        `[strike/gps] ${label} rejected — ${Math.round(distance)} m in ${seconds.toFixed(1)} s ` +
          `(${Math.round(speed)} m/s)`
      );
      return false;
    }
  }

  lastAccepted = { latitude, longitude, at };
  store.appendRoutePoint({ latitude, longitude }, "gps", at);
  checkZones({ latitude, longitude }, tripId);
  return true;
}

/**
 * The task itself. Must be defined at module scope, at startup — this file is
 * imported by TripWatcher, which the root layout imports — so that iOS can
 * deliver positions to it from the first moment.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[strike/gps] background task error", error.message);
    return;
  }
  const state = useStrikeStore.getState();
  if (!state.activeTrip) {
    // Updates left registered by a trip that no longer exists (the app was
    // killed mid-trip and the trip discarded). Only stop once the store has
    // loaded: before that, "no trip" may just mean "not read yet".
    if (state.isHydrated) void stopBackgroundTracking();
    return;
  }
  const locations = [...(data?.locations ?? [])].sort((a, b) => a.timestamp - b.timestamp);
  for (const location of locations) ingestPosition(location, "fix");
});

// A notification that arrives while the app happens to be open should still
// show; the zone check uses an alert in that case, but timing can overlap.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

/**
 * Starts recording the route in the background. Resolves false when that is
 * not possible here — Expo Go, a simulator build without the background
 * mode, location services off — and the caller falls back to the
 * foreground-only watch.
 */
/**
 * Starts and stops are queued, one after the other. Both are async, and a
 * stop from the trip that just ended must not land after the start of the
 * next one — that would switch tracking off for the new trip.
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export function startBackgroundTracking(): Promise<boolean> {
  return serial(startNow);
}

async function startNow(): Promise<boolean> {
  try {
    await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
      // High, not Balanced: Balanced is ~100 m on iOS, and that noise alone
      // manufactures movement while the phone sits on a rock.
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
      // Android only; iOS delivers by distance.
      timeInterval: 3500,
      // The default lets iOS pause updates when it decides the user has
      // stopped moving — which is what an angler casting from one spot looks
      // like — and it does not reliably resume them in the background.
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      // Required for background updates under "While Using" permission, and
      // honest: the angler can see the app is tracking.
      showsBackgroundLocationIndicator: true
    });
    return true;
  } catch (error) {
    console.warn(
      `[strike/gps] background updates unavailable, using foreground watch: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/** Stops background recording if it is running. Safe to call any time. */
export function stopBackgroundTracking(): Promise<void> {
  return serial(stopNow);
}

async function stopNow(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
    }
  } catch (error) {
    console.warn("[strike/gps] stopping background updates failed", error);
  }
}
