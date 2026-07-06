import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { mockWeather } from "@/data/weather";
import { useStrikeStore } from "@/store/useStrikeStore";
import { formatWind } from "@/services/weather";
import { MetricChip } from "@/components/MetricChip";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Pill = { icon: ComponentProps<typeof Ionicons>["name"]; label: string };

export function WeatherStrip() {
  const { t } = useTranslation();
  const weather = useStrikeStore((state) => state.weather);
  const waterLevel = useStrikeStore((state) => state.waterLevel);

  // Same layout as before. When live weather is available we swap in the real
  // numbers (air, water, wind, pressure); tide/sunrise have no Open-Meteo
  // current field, so they keep the existing values. Offline -> full mock.
  const pressureLabel = weather ? `${Math.round(weather.pressure)} hPa` : mockWeather.pressure;

  const items: Pill[] = [];
  if (weather) {
    items.push({ icon: "thermometer-outline", label: t("weather.air", { v: Math.round(weather.airTemp) }) });
    if (weather.waterTemp !== null) {
      items.push({ icon: "water-outline", label: t("weather.water", { v: Math.round(weather.waterTemp) }) });
    }
    items.push({ icon: "navigate-outline", label: formatWind(weather) });
    items.push({ icon: "trending-down-outline", label: mockWeather.tide });
  } else {
    items.push(
      { icon: "thermometer-outline", label: t("weather.air", { v: mockWeather.airTempC }) },
      { icon: "water-outline", label: t("weather.water", { v: mockWeather.waterTempC }) },
      { icon: "navigate-outline", label: mockWeather.wind },
      { icon: "trending-down-outline", label: mockWeather.tide }
    );
  }

  // Water level pill is independent of Open-Meteo — shown whenever DMI data is
  // available, regardless of whether the weather fetch succeeded.
  if (waterLevel !== null) {
    const trendIcon: ComponentProps<typeof Ionicons>["name"] =
      waterLevel.trend === "rising"
        ? "arrow-up-outline"
        : waterLevel.trend === "falling"
          ? "arrow-down-outline"
          : "remove-outline";
    const trendLabel =
      waterLevel.trend === "rising"
        ? t("weather.rising")
        : waterLevel.trend === "falling"
          ? t("weather.falling")
          : t("weather.stable");
    items.push({ icon: trendIcon, label: `${waterLevel.level} cm · ${trendLabel}` });
  }

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.location}>{mockWeather.location}</Text>
        <Text style={styles.meta}>
          {t("weather.meta", { pressure: pressureLabel, sunrise: mockWeather.sunrise })}
        </Text>
      </View>
      <View style={styles.grid}>
        {items.map((item) => (
          <MetricChip key={item.label} icon={item.icon} label={item.label} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    gap: 14,
    shadowColor: Colors.glowAmber,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  location: {
    color: Colors.textBright,
    fontSize: 22,
    fontFamily: Fonts.heading,
    fontWeight: "800",
    letterSpacing: 0
  },
  meta: {
    color: Colors.textMuted,
    marginTop: 3,
    fontSize: 13,
    fontFamily: Fonts.body
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
});
