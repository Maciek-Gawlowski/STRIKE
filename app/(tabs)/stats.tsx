import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { getStatistics, type Statistics } from "@/services/statistics";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function timeOfDayKey(range: string): string {
  const startHour = parseInt(range.slice(0, 2), 10);
  if (startHour >= 5 && startHour < 9) return "earlyMorning";
  if (startHour >= 9 && startHour < 12) return "lateMorning";
  if (startHour >= 12 && startHour < 15) return "midday";
  if (startHour >= 15 && startHour < 18) return "afternoon";
  if (startHour >= 18 && startHour < 21) return "evening";
  return "night";
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await getStatistics();
    setStats(result);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.textMuted} />
  );

  const header = (
    <Pressable style={styles.back} onPress={() => router.back()}>
      <Ionicons name="chevron-back" size={22} color={Colors.text} />
      <Text style={styles.backText}>{t("common.home")}</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <Screen refreshControl={refreshControl}>
        {header}
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>{t("stats.kicker")}</Text>
          <Text style={styles.title}>{t("stats.title")}</Text>
        </View>
        <Text style={styles.subtle}>{t("stats.loading")}</Text>
      </Screen>
    );
  }

  if (!stats) {
    return (
      <Screen refreshControl={refreshControl}>
        {header}
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>{t("stats.kicker")}</Text>
          <Text style={styles.title}>{t("stats.title")}</Text>
        </View>
        <GlassCard style={styles.emptyCard}>
          <Ionicons name="bar-chart-outline" size={30} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{t("stats.empty")}</Text>
        </GlassCard>
      </Screen>
    );
  }

  const hoursPerCatch = stats.totalCatches > 0 ? stats.totalHours / stats.totalCatches : null;

  return (
    <Screen refreshControl={refreshControl}>
      {header}

      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>{t("stats.kicker")}</Text>
        <Text style={styles.title}>{t("stats.title")}</Text>
      </View>

      {/* a) Overview */}
      <SectionHeader title={t("stats.overview")} />
      <View style={styles.gridRow}>
        <MetricCard label={t("stats.trips")} value={stats.totalTrips} />
        <MetricCard label={t("metrics.catches")} value={stats.totalCatches} />
      </View>
      <View style={styles.gridRow}>
        <MetricCard label={t("metrics.contacts")} value={stats.totalContacts} />
        <MetricCard label={t("stats.following")} value={stats.totalFollowing} />
      </View>

      {/* b) Averages */}
      <SectionHeader title={t("stats.averages")} />
      <GlassCard style={styles.panel}>
        <Text style={styles.line}>{t("stats.avgCatchesPerTrip", { v: stats.catchesPerTrip.toFixed(1) })}</Text>
        <Text style={styles.line}>
          {stats.avgDistanceBetweenContacts !== null
            ? t("stats.avgContactPerKm", { v: stats.avgDistanceBetweenContacts.toFixed(1) })
            : t("stats.avgNoContacts")}
        </Text>
        <Text style={styles.line}>
          {hoursPerCatch !== null
            ? t("stats.avgCatchPerHours", { v: hoursPerCatch.toFixed(1) })
            : t("stats.avgNoCatches")}
        </Text>
        {stats.avgTimeBetweenContacts !== null ? (
          <Text style={styles.line}>
            {t("stats.avgContactPerMin", { v: Math.round(stats.avgTimeBetweenContacts) })}
          </Text>
        ) : null}
        <View style={styles.divider} />
        <Text style={styles.lineMuted}>
          {t("stats.totals", { km: stats.totalDistance.toFixed(1), h: stats.totalHours.toFixed(1) })}
        </Text>
      </GlassCard>

      {/* c) Best time of day */}
      <SectionHeader title={t("stats.bestTime")} />
      <GlassCard style={styles.panel}>
        {stats.bestTimeOfDay ? (
          <Text style={styles.lineStrong}>
            {t(`stats.timeOfDay.${timeOfDayKey(stats.bestTimeOfDay)}`)} ({stats.bestTimeOfDay})
          </Text>
        ) : (
          <Text style={styles.lineMuted}>{t("stats.notEnoughCatches")}</Text>
        )}
      </GlassCard>

      {/* d) Catches by wind direction */}
      <SectionHeader title={t("stats.byWind")} />
      <GlassCard style={styles.panel}>
        {stats.catchesByWindDirection.length > 0 ? (
          stats.catchesByWindDirection.map((item) => (
            <View key={item.direction} style={styles.statRow}>
              <Text style={styles.statKey}>{item.direction}</Text>
              <Text style={styles.statValue}>{item.count}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.lineMuted}>{t("stats.noWindData")}</Text>
        )}
      </GlassCard>

      {/* e) Catches by water temperature */}
      <SectionHeader title={t("stats.byWaterTemp")} />
      <GlassCard style={styles.panel}>
        {stats.catchesByWaterTemp.map((item) => (
          <View key={item.range} style={styles.statRow}>
            <Text style={styles.statKey}>{item.range}</Text>
            <Text style={styles.statValue}>{item.count}</Text>
          </View>
        ))}
      </GlassCard>

      {/* f) Records */}
      <SectionHeader title={t("stats.records")} />
      {stats.longestTrip ? (
        <GlassCard style={styles.panel}>
          <Text style={styles.recordLabel}>{t("stats.longestTrip")}</Text>
          <Text style={styles.recordValue}>
            {stats.longestTrip.distance.toFixed(2)} km / {stats.longestTrip.duration}
          </Text>
          <Text style={styles.lineMuted}>{formatDate(stats.longestTrip.date)}</Text>
        </GlassCard>
      ) : null}
      {stats.bestTrip ? (
        <GlassCard style={styles.panel}>
          <Text style={styles.recordLabel}>{t("stats.bestTrip")}</Text>
          <Text style={styles.recordValue}>
            {t("stats.bestTripValue", { catches: stats.bestTrip.catches, contacts: stats.bestTrip.contacts })}
          </Text>
          <Text style={styles.lineMuted}>{formatDate(stats.bestTrip.date)}</Text>
        </GlassCard>
      ) : null}
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
  titleBlock: {
    gap: 2
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
  subtle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body
  },
  gridRow: {
    flexDirection: "row",
    gap: 9
  },
  panel: {
    padding: 16,
    gap: 10
  },
  line: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    letterSpacing: 0
  },
  lineStrong: {
    color: Colors.amber,
    fontSize: 16,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  lineMuted: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.body
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  statKey: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    letterSpacing: 0
  },
  statValue: {
    color: Colors.textBright,
    fontSize: 15,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  recordLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0
  },
  recordValue: {
    color: Colors.textBright,
    fontSize: 18,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  emptyCard: {
    padding: 28,
    gap: 12,
    alignItems: "center"
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    textAlign: "center",
    letterSpacing: 0
  }
});
