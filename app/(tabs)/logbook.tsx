import { Ionicons } from "@expo/vector-icons";
import { isCountedTrip } from "@/services/tripRules";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

/**
 * One metric in a trip row. Plain text on the card, no pill: four filled
 * capsules per row turned a quiet list into a wall of buttons, and none of
 * them were tappable.
 */
function Metric({
  icon,
  value,
  highlight
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={highlight ? Colors.amber : Colors.textMuted} />
      <Text style={[styles.statText, highlight && styles.statTextStrong]}>{value}</Text>
    </View>
  );
}

export default function LogbookScreen() {
  const { t } = useTranslation();
  const trips = useStrikeStore((state) => state.trips);

  const groupedTrips = useMemo(() => {
    const groups = new Map<string, typeof trips>();
    // The same rule the statistics use. Before this, a trip somebody forgot to
    // stop appeared here but was excluded from every number on the Statistics
    // screen, so the two screens disagreed about the same month in front of
    // the person who fished it.
    for (const trip of trips.filter(isCountedTrip)) {
      const key = new Date(trip.startedAt).toLocaleDateString([], { year: "numeric", month: "long" });
      const existing = groups.get(key) ?? [];
      existing.push(trip);
      groups.set(key, existing);
    }
    return Array.from(groups.entries());
  }, [trips]);

  return (
    <Screen>
      <Text style={styles.title}>{t("logbook.title")}</Text>

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
                return (
                  <Pressable
                    key={trip.id}
                    style={styles.card}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                  >
                    {/* No map thumbnail here. Coastal sea-trout trips are walks
                        along the same few hundred metres of shoreline, so at 90 px
                        every card drew the same grey squiggle and the list looked
                        like a rendering bug. The route is on the trip screen,
                        where it is big enough to mean something. */}
                    <View style={styles.cardTop}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={styles.date} numberOfLines={2}>{trip.title}</Text>
                        <Text style={styles.place}>{new Date(trip.startedAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                    </View>
                    <View style={styles.stats}>
                      <Metric icon="time-outline" value={formatDuration(trip.startedAt, trip.endedAt)} />
                      <Metric icon="footsteps-outline" value={formatDistance(trip.distanceMeters)} />
                      <Metric icon="fish-outline" value={String(catches)} highlight={catches > 0} />
                      <Metric icon="flash-outline" value={String(contacts)} />
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
    borderRadius: 16,
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
  title: {
    color: Colors.textBright,
    fontSize: 34,
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
    fontSize: 20,
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
    fontSize: 15,
    letterSpacing: 0,
  },
  monthCatchCount: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  cardTitleWrap: {
    flex: 1,
  },
  date: {
    color: Colors.textBright,
    fontSize: 17,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  place: {
    color: Colors.textMuted,
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.body
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 12,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0,
  },
  statTextStrong: {
    color: Colors.textBright,
  }
});
