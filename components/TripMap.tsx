import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";
import { Coordinate, StrikeEvent } from "@/store/useStrikeStore";

type TripMapProps = {
  route: Coordinate[];
  events: StrikeEvent[];
  height?: number;
  interactive?: boolean;
};

const markerColors = {
  contact: "#f4c84f",
  following: "#5AA9E6",
  catch: "#35d48f"
};

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

export function TripMap({ route, events, height = 260, interactive = true }: TripMapProps) {
  return (
    <View style={[styles.shell, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={regionFrom(route)}
        region={route.length > 0 ? regionFrom(route) : undefined}
        customMapStyle={mapStyle}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        showsUserLocation
        showsCompass={false}
      >
        {route.length > 1 ? <Polyline coordinates={route} strokeColor="#44d49c" strokeWidth={5} /> : null}
        {events.map((event) => (
          <Marker
            key={event.id}
            coordinate={event.position}
            pinColor={markerColors[event.type]}
            title={event.type === "following" ? "Following" : event.type}
            description={new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          />
        ))}
      </MapView>
      {route.length <= 1 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Henter position…</Text>
          <Text style={styles.emptyText}>Venter på GPS-signal — turen er allerede i gang.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#0c1a17",
    borderWidth: 1,
    borderColor: "rgba(233, 245, 238, 0.08)"
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
