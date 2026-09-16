import * as Location from "expo-location";
import { useEffect } from "react";
import { Alert, Linking } from "react-native";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { timeOfDayKey } from "@/services/tripName";

const WEATHER_INTERVAL_MS = 15 * 60 * 1000;

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
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted) {
        return;
      }

      if (permission.status !== "granted") {
        // Without mock tracking a release build would record nothing and say
        // nothing, so tell the user why the map stays empty.
        if (!__DEV__) {
          Alert.alert(
            t("trip.locationDeniedTitle"),
            t("trip.locationDeniedBody"),
            [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("trip.locationDeniedOpenSettings"), onPress: () => void Linking.openSettings() }
            ]
          );
        }
        startMockTracking();
        return;
      }

      try {
        // Balanced accuracy returns a first fix far faster than High/Highest,
        // so the trip starts tracking quickly instead of stalling on GPS.
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        appendRoutePoint(
          {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude
          },
          "gps"
        );

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
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 8,
            timeInterval: 3500
          },
          (position) => {
            appendRoutePoint(
              {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              },
              "gps"
            );
          }
        );
      } catch {
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
