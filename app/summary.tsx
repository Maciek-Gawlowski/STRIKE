import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { MetricChip } from "@/components/MetricChip";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { LureColourDot } from "@/components/LureColourDot";
import { getDb } from "@/database/db";
import { getLureById, type Lure } from "@/database/lures";
import { getWeatherForEvent, type WeatherSnapshot } from "@/database/queries";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { degreesToCompass } from "@/services/weather";
import { getStreakData } from "@/services/statistics";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function SummaryScreen() {
  const { t } = useTranslation();
  const trips = useStrikeStore((state) => state.trips);
  const lastCompletedTripId = useStrikeStore((state) => state.lastCompletedTripId);
  const mapType = useStrikeStore((state) => state.mapType);
  const trip = trips.find((item) => item.id === lastCompletedTripId) ?? trips[0];

  const [tripWeather, setTripWeather] = useState<WeatherSnapshot | null>(null);
  const [lureMap, setLureMap] = useState<Record<string, Lure>>({});
  const [isPB, setIsPB] = useState(false);

  // Load the first available weather snapshot for this trip.
  useEffect(() => {
    if (!trip || trip.events.length === 0) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      for (const event of trip.events) {
        const wx = await getWeatherForEvent(db, event.id);
        if (wx && !cancelled) {
          setTripWeather(wx);
          return;
        }
      }
    })().catch(() => null);
    return () => { cancelled = true; };
  }, [trip?.id]);

  // Check for personal best (most catches in a single trip).
  useEffect(() => {
    if (!trip) return;
    const tripCatches = trip.events.filter((e) => e.type === "catch").length;
    if (tripCatches === 0) return;
    getStreakData()
      .then((data) => {
        // bestCatchesTrip in the DB already includes this trip (it's completed),
        // so if this trip's count equals the record it set the new high.
        if (tripCatches >= data.bestCatchesTrip) setIsPB(true);
      })
      .catch(() => null);
  }, [trip?.id]);

  // Load lures for all catch events.
  useEffect(() => {
    if (!trip) return;
    const lureIds = [...new Set(
      trip.events
        .filter((e) => e.type === "catch" && e.lureId)
        .map((e) => e.lureId as string)
    )];
    if (lureIds.length === 0) return;

    let cancelled = false;
    Promise.all(
      lureIds.map((id) => getDb().then((db) => getLureById(db, id)))
    )
      .then((lures) => {
        if (cancelled) return;
        const map: Record<string, Lure> = {};
        lureIds.forEach((id, i) => {
          const lure = lures[i];
          if (lure) map[id] = lure;
        });
        setLureMap(map);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [trip?.id]);

  const handleShare = () => {
    if (!trip) return;
    router.push(`/share?tripId=${trip.id}` as never);
  };


  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!trip) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("summary.noSummary")}</Text>
          <Text style={styles.emptyHint}>{t("summary.noSummaryHint")}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/")}>
            <Text style={styles.primaryText}>{t("common.home")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const contacts = trip.events.filter((e) => e.type === "contact").length;
  const catches = trip.events.filter((e) => e.type === "catch");

  const dateStr = new Date(trip.startedAt).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Conditions chips from the trip's stored snapshot.
  const conditionChips: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [];
  if (tripWeather) {
    if (tripWeather.airTemp != null) {
      conditionChips.push({ icon: "thermometer-outline", label: `${Math.round(tripWeather.airTemp)}°C luft` });
    }
    if (tripWeather.waterTemp != null) {
      conditionChips.push({ icon: "water-outline", label: `${Math.round(tripWeather.waterTemp)}°C vand` });
    }
    if (tripWeather.windSpeed != null) {
      const dir = tripWeather.windDirection
        ? (tripWeather.windDirection.length <= 3
          ? tripWeather.windDirection // already a compass label
          : degreesToCompass(parseFloat(tripWeather.windDirection)))
        : "";
      conditionChips.push({ icon: "navigate-outline", label: `${dir} ${Math.round(tripWeather.windSpeed)} m/s`.trim() });
    }
  }

  return (
    <Screen contentStyle={styles.screen}>

      {/* Nav */}
      <View style={styles.nav}>
        <View style={styles.navLeft}>
          <Text style={styles.kicker}>{t("summary.kicker")}</Text>
          <Text style={styles.tripTitle}>{trip.title}</Text>
          <Text style={styles.tripDate}>{dateStr}</Text>
        </View>
        <Pressable style={styles.homeBtn} onPress={() => router.replace("/")}>
          <Ionicons name="home-outline" size={20} color={Colors.text} />
        </Pressable>
      </View>

      {/* Hero route map */}
      <TripMap
        route={trip.route}
        events={trip.events}
        height={340}
        interactive={false}
        mapType={mapType}
      />

      {/* Big stats 2×2 */}
      <View style={styles.statsGrid}>
        <StatBlock value={formatDuration(trip.startedAt, trip.endedAt)} label={t("metrics.duration")} />
        <StatBlock value={formatDistance(trip.distanceMeters)} label={t("metrics.distance")} />
        <StatBlock value={String(contacts)} label={t("metrics.contacts")} />
        <StatBlock value={String(catches.length)} label={t("metrics.catches")} />
      </View>

      {/* Personal best banner */}
      {isPB ? (
        <View style={styles.pbBanner}>
          <Ionicons name="trophy-outline" size={20} color={Colors.amber} />
          <View style={styles.pbText}>
            <Text style={styles.pbTitle}>{t("summary.pbTitle")}</Text>
            <Text style={styles.pbSub}>{t("summary.pbSub")}</Text>
          </View>
        </View>
      ) : null}

      {/* Conditions strip */}
      {conditionChips.length > 0 ? (
        <GlassCard style={styles.conditionsCard}>
          <Text style={styles.sectionKicker}>{t("summary.conditionsTitle")}</Text>
          <View style={styles.chipsRow}>
            {conditionChips.map((chip) => (
              <MetricChip key={chip.label} icon={chip.icon} label={chip.label} />
            ))}
          </View>
        </GlassCard>
      ) : null}

      {/* Catch list */}
      <View style={styles.catchSection}>
        <Text style={styles.sectionKicker}>{t("summary.catchesTitle")}</Text>
        {catches.length === 0 ? (
          <Text style={styles.noCatches}>{t("summary.noCatches")}</Text>
        ) : (
          <GlassCard style={styles.catchList}>
            {catches.map((event, idx) => {
              const lure = event.lureId ? lureMap[event.lureId] : undefined;
              return (
                <Pressable
                  key={event.id}
                  style={[styles.catchRow, idx > 0 && styles.catchRowBorder]}
                  onPress={() => router.push(`/event/${event.id}`)}
                >
                  {/* Thumb */}
                  {event.photoUri ? (
                    <Image source={{ uri: event.photoUri }} style={styles.catchThumb} />
                  ) : (
                    <View style={[styles.catchThumb, styles.catchThumbEmpty]}>
                      <Ionicons name="fish-outline" size={16} color={Colors.textMuted} />
                    </View>
                  )}

                  {/* Info */}
                  <View style={styles.catchInfo}>
                    <Text style={styles.catchSpecies} numberOfLines={1}>
                      {event.species ?? t("events.catch")}
                    </Text>
                    {event.lengthCm != null ? (
                      <Text style={styles.catchMeta}>{event.lengthCm} cm</Text>
                    ) : null}
                  </View>

                  {/* Lure dot */}
                  {lure ? (
                    <LureColourDot
                      colourKey={lure.colour}
                      colourSecondaryKey={lure.colourSecondary}
                      size={14}
                    />
                  ) : null}

                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })}
          </GlassCard>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.push("/logbook")}>
          <Ionicons name="file-tray-full-outline" size={20} color={Colors.text} />
          <Text style={styles.secondaryText}>{t("actions.openLogbook")}</Text>
        </Pressable>
        <Pressable
          style={styles.primary}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={20} color={Colors.textOnAmber} />
          <Text style={styles.primaryText}>{t("summary.shareBtn")}</Text>
        </Pressable>
      </View>

    </Screen>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  nav: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  navLeft: {
    flex: 1,
    gap: 2,
    paddingRight: 12,
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0,
  },
  tripTitle: {
    color: Colors.textBright,
    fontSize: 32,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
    lineHeight: 36,
  },
  tripDate: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.body,
    letterSpacing: 0,
    marginTop: 2,
  },
  homeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field,
  },
  // ── Stats grid ──
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBlock: {
    width: "47%",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  statValue: {
    color: Colors.textBright,
    fontFamily: Fonts.black,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  // ── PB banner ──
  pbBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.amber,
  },
  pbText: {
    flex: 1,
    gap: 2,
  },
  pbTitle: {
    color: Colors.amber,
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0,
  },
  pbSub: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0,
  },
  // ── Conditions ──
  conditionsCard: {
    padding: 16,
    gap: 10,
  },
  sectionKicker: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  // ── Catch list ──
  catchSection: {
    gap: 10,
  },
  noCatches: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 14,
    letterSpacing: 0,
  },
  catchList: {
    padding: 0,
    overflow: "hidden",
  },
  catchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  catchRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  catchThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  catchThumbEmpty: {
    backgroundColor: Colors.field,
    alignItems: "center",
    justifyContent: "center",
  },
  catchInfo: {
    flex: 1,
    gap: 2,
  },
  catchSpecies: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0,
  },
  catchMeta: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0,
  },
  // ── Actions ──
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondary: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryText: {
    color: Colors.text,
    fontFamily: Fonts.heading,
    fontSize: 14,
    letterSpacing: 0,
  },
  primary: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.amber,
  },
  primaryText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 14,
    letterSpacing: 0,
  },
  // ── Empty state ──
  empty: {
    gap: 16,
    paddingTop: 50,
    alignItems: "flex-start",
  },
  emptyTitle: {
    color: Colors.textBright,
    fontSize: 28,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
  },
  emptyHint: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    letterSpacing: 0,
  },
});
