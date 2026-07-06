import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function SummaryScreen() {
  const { t } = useTranslation();
  const trips = useStrikeStore((state) => state.trips);
  const lastCompletedTripId = useStrikeStore((state) => state.lastCompletedTripId);
  const trip = trips.find((item) => item.id === lastCompletedTripId) ?? trips[0];

  if (!trip) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Text style={styles.title}>{t("summary.noSummary")}</Text>
          <Text style={styles.subtitle}>{t("summary.noSummaryHint")}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/")}>
            <Text style={styles.primaryText}>{t("common.home")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const contacts = trip.events.filter((event) => event.type === "contact").length;
  const catches = trip.events.filter((event) => event.type === "catch").length;
  const following = trip.events.filter((event) => event.type === "following").length;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{t("summary.kicker")}</Text>
          <Text style={styles.title}>{trip.title}</Text>
          <Text style={styles.subtitle}>{new Date(trip.startedAt).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => router.replace("/")}>
          <Ionicons name="home-outline" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <MetricCard label={t("metrics.duration")} value={formatDuration(trip.startedAt, trip.endedAt)} />
        <MetricCard label={t("metrics.distance")} value={formatDistance(trip.distanceMeters)} />
        <MetricCard label={t("metrics.contacts")} value={contacts} />
        <MetricCard label={t("metrics.catches")} value={catches} />
        <MetricCard label={t("metrics.following")} value={following} />
        <MetricCard label={t("metrics.steps")} value={trip.steps} />
      </View>

      <TripMap route={trip.route} events={trip.events} height={310} interactive={false} />

      <View style={styles.timeline}>
        <Text style={styles.sectionTitle}>{t("summary.taggedEvents")}</Text>
        {trip.events.length === 0 ? (
          <Text style={styles.subtitle}>{t("summary.noEvents")}</Text>
        ) : (
          trip.events.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={[styles.eventDot, event.type === "catch" && styles.catchDot, event.type === "following" && styles.followingDot]} />
              <View style={styles.eventCopy}>
                <Text style={styles.eventTitle}>{event.type === "following" ? t("events.following") : event.type === "catch" ? event.species ?? t("events.catch") : t("events.contact")}</Text>
                <Text style={styles.eventMeta}>
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} /{" "}
                  {event.position.latitude.toFixed(5)}, {event.position.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.push("/logbook")}>
          <Ionicons name="file-tray-full-outline" size={20} color={Colors.text} />
          <Text style={styles.secondaryText}>{t("actions.openLogbook")}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={() => router.replace("/")}>
          <Ionicons name="navigate-circle-outline" size={21} color={Colors.textOnAmber} />
          <Text style={styles.primaryText}>{t("actions.newTrip")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
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
    letterSpacing: 0,
    lineHeight: 39
  },
  subtitle: {
    color: Colors.textMuted,
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  timeline: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14
  },
  sectionTitle: {
    color: Colors.textBright,
    fontSize: 18,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  eventRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  eventDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f4c84f"
  },
  catchDot: {
    backgroundColor: "#35d48f"
  },
  followingDot: {
    backgroundColor: "#5AA9E6"
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
    fontSize: 12,
    fontFamily: Fonts.body
  },
  actions: {
    flexDirection: "row",
    gap: 10
  },
  secondary: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.card
  },
  secondaryText: {
    color: Colors.text,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  primary: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.amber
  },
  primaryText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  empty: {
    gap: 16,
    paddingTop: 50
  }
});
