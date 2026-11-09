import * as Location from "expo-location";
import { useEffect } from "react";
import { Alert, Linking } from "react-native";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { timeOfDayKey } from "@/services/tripName";
import { hasPrimedLocation, markLocationPrimed } from "@/database/preferences";

const WEATHER_INTERVAL_MS = 15 * 60 * 1000;

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
 * it is the one that actually stops the island jumps: two kilometres in a
 * minute is 33 m/s and still gets thrown out. This only loosens precision,
 * never plausibility.
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

export function TripWatcher() {
  const { t } = useTranslation();
  const activeTripId = useStrikeStore((state) => state.activeTrip?.id);
  const appendRoutePoint = useStrikeStore((state) => state.appendRoutePoint);

  useEffect(() => {
    if (!activeTripId) {
      return undefined;
    }

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;
    let mockTimer: ReturnType<typeof setInterval> | null = null;

    // Last position we trusted, for the speed check. Deliberately not read
    // from the store: the store holds what was accepted, which is the same
    // thing, but reading it here would couple the filter to the store's
    // shape for no gain.
    let lastAccepted: { latitude: number; longitude: number; at: number } | null = null;

    /**
     * Writes a fix to the route if it survives both guards.
     *
     * Rejections are logged rather than swallowed. A route quietly missing
     * half its points looks exactly like a short walk, and that is how this
     * class of bug stays invisible for weeks.
     */
    const acceptPosition = (
      position: Location.LocationObject,
      label: string,
      /**
       * Skips the accuracy guard. Used for the opening fix only, which is
       * fetched at Balanced accuracy (~100 m on iOS) and would therefore
       * fail the 50 m test every single time. Without it there is no first
       * point, so no route, no trip name, and nothing for the speed guard to
       * measure against — the filter would starve the route from the start
       * rather than protect it. The watch that follows runs at High and is
       * guarded normally.
       */
      alwaysAccept = false
    ) => {
      const { latitude, longitude, accuracy } = position.coords;
      const at = position.timestamp ?? Date.now();

      const starving =
        alwaysAccept || (lastAccepted != null && at - lastAccepted.at > ACCURACY_STARVATION_MS);

      if (accuracy != null && accuracy > MAX_ACCURACY_M && !starving) {
        console.warn(`[strike/gps] ${label} rejected — accuracy ${Math.round(accuracy)} m`);
        return;
      }

      if (starving && !alwaysAccept && accuracy != null && accuracy > MAX_ACCURACY_M) {
        console.warn(
          `[strike/gps] ${label} accepted at ${Math.round(accuracy)} m — nothing better for 60 s`
        );
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
          return;
        }
      }

      lastAccepted = { latitude, longitude, at };
      appendRoutePoint({ latitude, longitude }, "gps");
    };

    const weatherTimer = setInterval(() => {
      useStrikeStore.getState().refreshWeather();
    }, WEATHER_INTERVAL_MS);

    /**
     * Simulated movement for the simulator / denied-permission development
     * flow. It must never run in a release build: it draws a fabricated route
     * drifting north-east from the demo start point near Stevns, which a tester
     * on Als would see as the app inventing a trip they never took.
     */
    const startMockTracking = () => {
      if (!__DEV__) return;
      console.warn("[strike/gps] simulated tracking active — this route is not real");
      mockTimer = setInterval(() => {
        const state = useStrikeStore.getState();
        const last = state.activeTrip?.route.at(-1) ?? state.currentLocation ?? {
          latitude: 55.2796,
          longitude: 12.4481
        };
        appendRoutePoint(
          {
            latitude: last.latitude + 0.00012,
            longitude: last.longitude + 0.00021
          },
          "mock"
        );
      }, 3500);
    };

    const start = async () => {
      // Explain before iOS asks. The system dialog is one shot: decline it and
      // it never appears again, and the app silently records nothing forever.
      // A sentence about why buys back most of the reflexive "Don't allow".
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.status === "undetermined" && !(await hasPrimedLocation())) {
        await markLocationPrimed();
        await new Promise<void>((resolve) => {
          Alert.alert(
            t("trip.locationPrimeTitle"),
            t("trip.locationPrimeBody"),
            [{ text: t("trip.locationPrimeBtn"), onPress: () => resolve() }],
            { onDismiss: () => resolve() }
          );
        });
        if (!mounted) return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted) {
        return;
      }

      if (permission.status !== "granted") {
        // This alert used to be suppressed in development, which meant the one
        // person able to fix a permissions problem was the only one never told
        // about it: the app switched to fabricated positions in silence and
        // looked like it was tracking. Whoever is holding the phone gets told.
        console.warn(
          `[strike/gps] location permission ${permission.status} — falling back to simulated positions`
        );
        Alert.alert(
          t("trip.locationDeniedTitle"),
          t("trip.locationDeniedBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("trip.locationDeniedOpenSettings"), onPress: () => void Linking.openSettings() }
          ]
        );
        startMockTracking();
        return;
      }

      try {
        // Balanced accuracy returns a first fix far faster than High/Highest,
        // so the trip starts tracking quickly instead of stalling on GPS.
        // Balanced for the FIRST fix only: it returns in a second or two where
        // High can stall, and the trip needs a starting point more than it
        // needs a precise one. The watch below runs at High.
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        acceptPosition(current, "first fix", true);

        // Name the trip after where it actually started. The user pressed Start
        // before any fix existed, so the trip is carrying a time-of-day name
        // like "Morgentur" — and three of those in a row make a logbook of
        // identical rows. renameActiveTrip ignores this if the user typed a
        // title of their own.
        void Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        })
          .then(([geo]) => {
            if (!mounted) return;
            const place = geo?.city ?? geo?.subregion ?? geo?.district ?? geo?.street ?? "";
            if (!place) return;
            useStrikeStore.getState().renameActiveTrip(
              t("home.tripNamePlace", { place, time: t(timeOfDayKey()) })
            );
          })
          .catch(() => undefined);

        subscription = await Location.watchPositionAsync(
          {
            // High, not Balanced. Balanced is ~100 m on iOS, and with an 8 m
            // distance filter that noise alone manufactures movement: the
            // distance counter climbs while the phone sits on a rock. High is
            // ~10 m. It costs battery, but the Barso test came back with
            // almost none used, so there is room.
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 3500
          },
          (position) => acceptPosition(position, "fix")
        );
      } catch (error) {
        // Same reasoning: a GPS failure that quietly becomes a fake route is
        // indistinguishable from a real one on screen.
        console.warn(
          `[strike/gps] position unavailable, falling back to simulated positions: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        startMockTracking();
      }
    };

    start();

    return () => {
      mounted = false;
      subscription?.remove();
      if (mockTimer) {
        clearInterval(mockTimer);
      }
      clearInterval(weatherTimer);
    };
  }, [activeTripId, appendRoutePoint, t]);

  return null;
}
