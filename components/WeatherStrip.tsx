import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
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

  const items: Pill[] = [];
  if (weather) {
    items.push({ icon: "thermometer-outline", label: t("weather.air", { v: Math.round(weather.airTemp) }) });
    if (weather.waterTemp !== null) {
      items.push({ icon: "water-outline", label: t("weather.water", { v: Math.round(weather.waterTemp) }) });
    }
    items.push({ icon: "navigate-outline", label: formatWind(weather) });
    items.push({ icon: "speedometer-outline", label: `${Math.round(weather.pressure)} hPa` });
  }

  // Water level pill is independent of Open-Meteo — shown whenever DMI data is
  // available, regardless of whether the weather fetch succeeded.
  if (waterLevel !== null) {
    const phaseIcon: ComponentProps<typeof Ionicons>["name"] =
      waterLevel.phase === "highTide" ? "chevron-up-outline" :
      waterLevel.phase === "lowTide"  ? "chevron-down-outline" :
      waterLevel.phase === "flooding" ? "arrow-up-outline" :
                                        "arrow-down-outline";
    const phaseLabel =
      waterLevel.phase === "flooding" ? t("weather.flooding") :
      waterLevel.phase === "ebbing"   ? t("weather.ebbing") :
      waterLevel.phase === "highTide" ? t("weather.highTide") :
                                        t("weather.lowTide");
    items.push({ icon: phaseIcon, label: `${waterLevel.level} cm · ${phaseLabel}` });
  }

  return (
    <View style={styles.wrap}>
      {items.length === 0 ? (
        <Text style={styles.empty}>{t("weather.fetching")}</Text>
      ) : (
        <View style={styles.grid}>
          {items.map((item, i) => (
            <MetricChip key={`${item.icon}-${i}`} icon={item.icon} label={item.label} />
          ))}
        </View>
      )}
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
    shadowColor: Colors.glowAmber,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  empty: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },
});
