import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function LogbookScreen() {
  const { t } = useTranslation();
  const trips = useStrikeStore((state) => state.trips);

  const groupedTrips = useMemo(() => {
    const groups = new Map<string, typeof trips>();
    for (const trip of trips) {
      const key = new Date(trip.startedAt).toLocaleDateString([], { year: "numeric", month: "long" });
      const existing = groups.get(key) ?? [];
      existing.push(trip);
      groups.set(key, existing);
    }
    return Array.from(groups.entries());
  }, [trips]);

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </View>

      <View>
        <Text style={styles.kicker}>{t("logbook.kicker")}</Text>
        <Text style={styles.title}>{t("logbook.title")}</Text>
      </View>

      {trips.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="journal-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{t("logbook.emptyTitle")}</Text>
          <Text style={styles.emptyBody}>{t("logbook.emptyBody")}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.replace("/")}>
            <Ionicons name="navigate-circle-outline" size={20} color={Colors.textOnAmber} />
            <Text style={styles.emptyBtnText}>{t("actions.startTrip")}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.list}>
        {groupedTrips.map(([monthLabel, monthTrips]) => {
          const monthCatches = monthTrips.reduce(
            (sum, trip) => sum + trip.events.filter((e) => e.type === "catch").length, 0
          );
          return (
            <View key={monthLabel}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
                <Text style={styles.monthCatchCount}>{t("logbook.catchesCount", { count: monthCatches })}</Text>
              </View>
              {monthTrips.map((trip) => {
                const catches = trip.events.filter((event) => event.type === "catch").length;
                const contacts = trip.events.filter((event) => event.type === "contact").length;
                const tierColor = catches >= 3 ? Colors.amber : catches >= 1 ? Colors.borderStrong : Colors.border;
                return (
                  <Pressable
                    key={trip.id}
                    style={[styles.card, { borderLeftWidth: 3, borderLeftColor: tierColor }]}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                  >
                    {trip.route.length > 1 ? (
                      <TripMap route={trip.route} events={trip.events} height={90} interactive={false} />
                    ) : null}
                    <View style={[styles.cardTop, trip.route.length > 1 && styles.cardTopMap]}>
                      <View>
                        <Text style={styles.date}>{trip.title}</Text>
                        <Text style={styles.place}>{new Date(trip.startedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                    </View>
                    <View style={styles.stats}>
                      <Text style={styles.stat}>{formatDuration(trip.startedAt, trip.endedAt)}</Text>
                      <Text style={styles.stat}>{formatDistance(trip.distanceMeters)}</Text>
                      <Text style={styles.stat}>{t("logbook.catchesCount", { count: catches })}</Text>
                      <Text style={styles.stat}>{t("logbook.contactsCount", { count: contacts })}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center"
  },
  back: {
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
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
    gap: 12
  },
  emptyTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 22,
    letterSpacing: 0,
    textAlign: "center"
  },
  emptyBody: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: Colors.amber
  },
  emptyBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0
  },
  list: {
    gap: 20
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  monthLabel: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0,
  },
  monthCatchCount: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0,
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 0,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    paddingTop: 14,
  },
  cardTopMap: {
    paddingTop: 12,
  },
  date: {
    color: Colors.textBright,
    fontSize: 19,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  place: {
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.body
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 17,
    paddingBottom: 14,
    paddingTop: 10,
  },
  stat: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: Colors.pill,
    letterSpacing: 0
  }
});
