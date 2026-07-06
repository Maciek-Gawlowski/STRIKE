import * as Location from "expo-location";
import { useEffect } from "react";
import { useStrikeStore } from "@/store/useStrikeStore";

export function TripWatcher() {
  const activeTripId = useStrikeStore((state) => state.activeTrip?.id);
  const appendRoutePoint = useStrikeStore((state) => state.appendRoutePoint);

  useEffect(() => {
    if (!activeTripId) {
      return undefined;
    }

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;
    let mockTimer: ReturnType<typeof setInterval> | null = null;

    const startMockTracking = () => {
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
    };
  }, [activeTripId, appendRoutePoint]);

  return null;
}
