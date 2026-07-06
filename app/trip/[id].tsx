import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function TripReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useStrikeStore((state) => state.trips.find((item) => item.id === id));

  if (!trip) {
    return (
      <Screen>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>Logbook</Text>
        </Pressable>
        <Text style={styles.title}>Trip not found</Text>
      </Screen>
    );
  }

  const catches = trip.events.filter((event) => event.type === "catch").length;
  const contacts = trip.events.filter((event) => event.type === "contact").length;
  const following = trip.events.filter((event) => event.type === "following").length;

  return (
    <Screen>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={Colors.text} />
        <Text style={styles.backText}>Logbook</Text>
      </Pressable>

      <View>
        <Text style={styles.kicker}>TRIP REVIEW</Text>
        <Text style={styles.title}>{trip.title}</Text>
        <Text style={styles.subtitle}>{new Date(trip.startedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</Text>
      </View>

      <TripMap route={trip.route} events={trip.events} height={340} />

      <View style={styles.metrics}>
        <MetricCard label="Duration" value={formatDuration(trip.startedAt, trip.endedAt)} />
        <MetricCard label="Distance" value={formatDistance(trip.distanceMeters)} />
        <MetricCard label="Catches" value={catches} />
        <MetricCard label="Contacts" value={contacts} />
        <MetricCard label="Following" value={following} />
      </View>

      <View style={styles.events}>
        <Text style={styles.sectionTitle}>Events</Text>
        {trip.events.map((event) => (
          <Pressable
            key={event.id}
            style={styles.eventRow}
            onPress={event.type === "catch" ? () => router.push(`/event/${event.id}`) : undefined}
          >
            <Ionicons
              name={event.type === "catch" ? "fish-outline" : event.type === "following" ? "eye-outline" : "flash-outline"}
              size={22}
              color={event.type === "catch" ? "#35d48f" : event.type === "following" ? "#5AA9E6" : "#f4c84f"}
            />
            <View style={styles.eventCopy}>
              <Text style={styles.eventTitle}>{event.type === "catch" ? event.species ?? "Catch" : event.type === "following" ? "Following" : "Contact"}</Text>
              <Text style={styles.eventMeta}>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
            {event.type === "catch" ? (
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: "flex-start",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field
  },
  backText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  title: {
    color: Colors.textBright,
    fontSize: 35,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  subtitle: {
    color: Colors.textMuted,
    marginTop: 4,
    fontSize: 14,
    fontFamily: Fonts.body
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  events: {
    borderRadius: 24,
    padding: 16,
    gap: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  sectionTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  eventCopy: {
    flex: 1
  },
  eventTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0
  },
  eventMeta: {
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.body
  }
});
