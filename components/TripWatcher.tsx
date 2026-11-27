import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { timeOfDayKey } from "@/services/tripName";
import * as Notifications from "expo-notifications";
import {
  hasPrimedLocation,
  hasPrimedNotifications,
  markLocationPrimed,
  markNotificationsPrimed
} from "@/database/preferences";
import { ingestPosition, startBackgroundTracking, stopBackgroundTracking } from "@/services/tripTracking";
import { resetZoneAlerts } from "@/services/zoneAlerts";

const WEATHER_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Starts and stops route recording with the trip. The recording itself — the
 * background task, the position filter, the zone check — lives in
 * services/tripTracking.ts so it can run with no screen to render.
 */
export function TripWatcher() {
  const { t: translate } = useTranslation();
  // Read through a ref: `t` is a new function on every render, and having it
  // in the effect's dependencies restarted GPS tracking whenever this
  // component re-rendered — with background updates, a stop racing a start.
  const tRef = useRef(translate);
  tRef.current = translate;
  const activeTripId = useStrikeStore((state) => state.activeTrip?.id);
  const appendRoutePoint = useStrikeStore((state) => state.appendRoutePoint);
  const isHydrated = useStrikeStore((state) => state.isHydrated);

  // No trip, but background updates may still be registered: iOS restarts a
  // registered location task on launch, so a trip that was killed and then
  // discarded would otherwise keep the GPS (and the blue indicator) on.
  useEffect(() => {
    if (!activeTripId && isHydrated) void stopBackgroundTracking();
  }, [activeTripId, isHydrated]);

  useEffect(() => {
    if (!activeTripId) {
      return undefined;
    }

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;
    let mockTimer: ReturnType<typeof setInterval> | null = null;
    let background = false;
    const t = (key: string, options?: Record<string, unknown>) => tRef.current(key, options);
    resetZoneAlerts(activeTripId);

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
        ingestPosition(current, "first fix", true);

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

        // Ask for notifications before the angler pockets the phone: a zone
        // warning in the background can only arrive as one.
        await primeNotifications(t);
        if (!mounted) return;

        background = await startBackgroundTracking();
        if (!mounted) {
          if (background) void stopBackgroundTracking();
          return;
        }
        if (background) {
          useStrikeStore.getState().setBackgroundTracking(true);
          return;
        }

        // Fallback: foreground only, as before build 54. The trip still
        // records while the app is open, and the gap banner explains the rest.
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 3500
          },
          (position) => ingestPosition(position, "fix")
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
      if (background) void stopBackgroundTracking();
      useStrikeStore.getState().setBackgroundTracking(false);
      resetZoneAlerts(null);
      if (mockTimer) {
        clearInterval(mockTimer);
      }
      clearInterval(weatherTimer);
    };
  }, [activeTripId, appendRoutePoint]);

  return null;
}

/**
 * Asks for notification permission once, with a sentence of why first — the
 * iOS dialog is one shot, like the location one. Declining is fine: the trip
 * records either way, and zone warnings still appear while the app is open.
 */
async function primeNotifications(t: (key: string) => string): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== "undetermined") return;
    if (await hasPrimedNotifications()) return;
    await markNotificationsPrimed();
    await new Promise<void>((resolve) => {
      Alert.alert(
        t("trip.notifyPrimeTitle"),
        t("trip.notifyPrimeBody"),
        [{ text: t("trip.locationPrimeBtn"), onPress: () => resolve() }],
        { onDismiss: () => resolve() }
      );
    });
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false }
    });
  } catch (error) {
    console.warn("[strike/notify] permission request failed", error);
  }
}
