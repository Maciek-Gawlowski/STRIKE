import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { getWeatherForEvent, type WeatherSnapshot } from "@/database/queries";
import { getDb } from "@/database/db";
import { degreesToCompass } from "@/services/weather";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

// Replace these files with real coastal/fish photos before launch.
const FISH_PLACEHOLDER = require("../../assets/fish-placeholder.png");

export default function CatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();

  const event = useStrikeStore((state) => {
    for (const trip of [state.activeTrip, ...state.trips]) {
      if (!trip) continue;
      const found = trip.events.find((e) => e.id === id);
      if (found) return found;
    }
    return null;
  });

  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    if (!id) return;
    getDb()
      .then((db) => getWeatherForEvent(db, id))
      .then(setWeather)
      .catch(() => null);
  }, [id]);

  if (!event) {
    return (
      <Screen>
        <Pressable style={styles.backInline} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backInlineText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.notFound}>Catch not found.</Text>
      </Screen>
    );
  }

  const miniRoute = [event.position, event.position];
  const dateStr = new Date(event.timestamp).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  const timeStr = new Date(event.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  const coordStr = `${event.position.latitude.toFixed(5)}, ${event.position.longitude.toFixed(5)}`;
  const hasPhoto = Boolean(event.photoUri);

  return (
    <Screen contentStyle={styles.screenContent}>

      {/* ── Full-bleed hero photo ── */}
      <View style={styles.hero}>
        <Image
          source={hasPhoto ? { uri: event.photoUri } : FISH_PLACEHOLDER}
          style={styles.heroImage}
          resizeMode="cover"
        />
        {/* Gradient darkens the bottom so text + card below stay legible */}
        <LinearGradient
          colors={["transparent", "rgba(13,27,42,0.62)", Colors.navy]}
          locations={[0.3, 0.68, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Back button floats top-left over the photo */}
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.textBright} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>

        {/* Kicker + species name sit inside the lower gradient */}
        <View style={styles.heroFooter}>
          <Text style={styles.kicker}>{t("catchDetail.kicker")}</Text>
          {event.species ? (
            <Text style={styles.heroSpecies}>{event.species}</Text>
          ) : null}
        </View>
      </View>

      {/* ── Body (padded) ── */}
      <View style={styles.body}>

        {/* Big stat cards: Længde | Vægt — hidden entirely when null */}
        {(event.lengthCm != null || event.weightKg != null) ? (
          <View style={styles.bigStats}>
            {event.lengthCm != null ? (
              <GlassCard style={styles.bigStatCard}>
                <Text style={styles.bigStatValue}>{event.lengthCm} cm</Text>
                <Text style={styles.bigStatLabel}>{t("catchDetail.length")}</Text>
              </GlassCard>
            ) : null}
            {event.weightKg != null ? (
              <GlassCard style={styles.bigStatCard}>
                <Text style={styles.bigStatValue}>{event.weightKg} kg</Text>
                <Text style={styles.bigStatLabel}>{t("catchDetail.weight")}</Text>
              </GlassCard>
            ) : null}
          </View>
        ) : null}

        {/* Detail rows */}
        <GlassCard style={styles.detailCard}>
          <DetailRow
            icon="calendar-outline"
            label={t("catchDetail.dateTime")}
            value={`${dateStr} · ${timeStr}`}
          />
          {event.species ? (
            <DetailRow
              icon="fish-outline"
              label={t("catchDetail.species")}
              value={event.species}
            />
          ) : null}
          <DetailRow
            icon={event.kept ? "home-outline" : "arrow-undo-outline"}
            label={t("catchDetail.outcome")}
            value={event.kept ? t("catchDetail.kept") : t("catchDetail.released")}
          />
          {weather?.waterTemp != null ? (
            <DetailRow
              icon="water-outline"
              label={t("catchDetail.waterTemp")}
              value={t("weather.water", { v: Math.round(weather.waterTemp) })}
            />
          ) : null}
          {weather?.windSpeed != null ? (
            <DetailRow
              icon="navigate-outline"
              label={t("catchDetail.wind")}
              value={`${weather.windDirection ? degreesToCompass(parseFloat(weather.windDirection)) : "–"} ${Math.round(weather.windSpeed)} m/s`}
            />
          ) : null}
          <DetailRow
            icon="location-outline"
            label={t("catchDetail.location")}
            value={coordStr}
          />
        </GlassCard>

        {/* Mini map pinned to the catch position */}
        <TripMap route={miniRoute} events={[event]} height={180} interactive={false} />
      </View>
    </Screen>
  );
}

type DetailRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
};

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={Colors.amber} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Screen override: remove all padding so the hero is edge-to-edge
  screenContent: {
    paddingTop: 0,
    paddingHorizontal: 0,
    gap: 0,
    paddingBottom: 36
  },

  // ── Hero ────────────────────────────────────────────────────
  hero: {
    height: 300,
    overflow: "hidden",
    backgroundColor: Colors.teal,
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 18
  },
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  back: {
    alignSelf: "flex-start",
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13,27,42,0.55)"
  },
  backText: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0
  },
  heroFooter: {
    gap: 3
  },
  kicker: {
    color: "rgba(242,243,239,0.65)",
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  heroSpecies: {
    color: Colors.textBright,
    fontSize: 30,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },

  // ── Body ────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 16
  },

  // Big stats
  bigStats: {
    flexDirection: "row",
    gap: 12
  },
  bigStatCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 22,
    gap: 2
  },
  bigStatValue: {
    color: Colors.textBright,
    fontSize: 44,
    fontFamily: Fonts.black,
    lineHeight: 48,
    letterSpacing: 0
  },
  bigStatLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4
  },

  // Detail rows
  detailCard: {
    padding: 18,
    gap: 16
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 36
  },
  detailLabel: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: Fonts.body,
    letterSpacing: 0
  },
  detailValue: {
    color: Colors.textBright,
    fontSize: 14,
    fontFamily: Fonts.bodyBold,
    textAlign: "right",
    letterSpacing: 0,
    flexShrink: 1
  },

  // Not-found fallback
  backInline: {
    alignSelf: "flex-start",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field
  },
  backInlineText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0
  },
  notFound: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 16,
    paddingTop: 40,
    textAlign: "center"
  }
});
