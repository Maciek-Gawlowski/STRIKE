import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import type { Coordinate, StrikeEvent } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Colors } from "@/theme/colors";

type TripMapProps = {
  route: Coordinate[];
  events: StrikeEvent[];
  height?: number;
  interactive?: boolean;
  mapType?: "standard" | "satellite" | "hybrid";
  /** Current device position — renders a pulsing dot when isActive is true. */
  currentLocation?: Coordinate;
  /** When true, shows the animated GPS dot and suppresses the system user-location dot. */
  isActive?: boolean;
  /** Renders a subtle bottom vignette so the map feels embedded in its container. */
  vignette?: boolean;
  /** Increment to trigger/restart a route replay animation. */
  replayTick?: number;
};

const markerColors = {
  contact:   "#f4c84f",
  following: "#5AA9E6",
  catch:     Colors.catchGreen,
};

const markerIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  contact:   "flash-outline",
  following: "eye-outline",
  catch:     "fish-outline",
};

function EventPin({ type }: { type: string }) {
  const color = markerColors[type as keyof typeof markerColors] ?? "#ffffff";
  const icon  = markerIcons[type] ?? "ellipse-outline";
  return (
    <View style={[pin.shell, { backgroundColor: color, borderColor: "rgba(255,255,255,0.55)" }]}>
      <Ionicons name={icon} size={14} color="#fff" />
    </View>
  );
}

const mapStyle = [
  { elementType: "geometry", stylers: [{ color: "#10211e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7f948d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#07110f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#143743" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#263b35" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#17382f" }] }
];

const regionFrom = (route: Coordinate[]): Region => {
  const point = route[route.length - 1] ?? { latitude: 55.2796, longitude: 12.4481 };
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018
  };
};

/** Pulsing amber ring rendered as a MapView Marker child. */
function GpsDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 2.4,
          duration: 1300,
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: true
        })
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
      scale.setValue(1);
      opacity.setValue(0.75);
    };
  }, []);

  return (
    <View style={dot.container}>
      <Animated.View style={[dot.ring, { transform: [{ scale }], opacity }]} />
      <View style={dot.core} />
    </View>
  );
}

function TripMapInner({
  route,
  events,
  height = 260,
  interactive = true,
  mapType = "standard",
  currentLocation,
  isActive = false,
  vignette = false,
  replayTick,
}: TripMapProps) {
  const { t } = useTranslation();
  const [displayCount, setDisplayCount] = useState<number | null>(null);

  useEffect(() => {
    if (replayTick === undefined) return;
    setDisplayCount(2);
    let count = 2;
    const interval = setInterval(() => {
      count += 1;
      if (count >= route.length) {
        setDisplayCount(route.length);
        clearInterval(interval);
      } else {
        setDisplayCount(count);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [replayTick]);

  const displayedRoute = displayCount !== null ? route.slice(0, displayCount) : route;

  return (
    <View style={[styles.shell, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={regionFrom(route)}
        region={route.length > 0 ? regionFrom(route) : undefined}
        mapType={mapType}
        customMapStyle={mapType === "standard" ? mapStyle : undefined}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        // Suppress the system blue dot when we're rendering our own animated one.
        showsUserLocation={!isActive}
        showsCompass={false}
      >
        {displayedRoute.length > 1 ? (
          <Polyline
            coordinates={displayedRoute}
            strokeColor="#f4c84f"
            strokeWidth={2}
            lineDashPattern={undefined}
          />
        ) : null}

        {events.map((event) => (
          <Marker
            key={event.id}
            coordinate={event.position}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            title={event.type === "following" ? "Following" : event.type}
            description={new Date(event.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}
          >
            <EventPin type={event.type} />
          </Marker>
        ))}

        {isActive && currentLocation ? (
          <Marker
            coordinate={currentLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            tracksViewChanges={false}
          >
            <GpsDot />
          </Marker>
        ) : null}
      </MapView>

      {vignette ? (
        <LinearGradient
          colors={["transparent", Colors.navy]}
          style={styles.vignette}
          pointerEvents="none"
        />
      ) : null}

      {displayedRoute.length <= 1 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("trip.gpsWaiting")}</Text>
          <Text style={styles.emptyText}>{t("trip.gpsWaitingHint")}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function TripMap(props: TripMapProps) {
  return (
    <ErrorBoundary>
      <TripMapInner {...props} />
    </ErrorBoundary>
  );
}

const pin = StyleSheet.create({
  shell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
});

const dot = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  ring: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#f4c84f"
  },
  core: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#f4c84f",
    borderWidth: 2,
    borderColor: "#0c1a17"
  }
});

const styles = StyleSheet.create({
  shell: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#0c1a17",
    borderWidth: 1,
    borderColor: "rgba(233, 245, 238, 0.08)"
  },
  vignette: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  empty: {
    position: "absolute",
    left: 16,
    bottom: 16,
    right: 16,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(2, 18, 16, 0.76)"
  },
  emptyTitle: {
    color: "#f4fbf6",
    fontWeight: "800",
    fontSize: 15
  },
  emptyText: {
    color: "#9fb4ad",
    marginTop: 3,
    fontSize: 12
  }
});
