import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useStrikeStore } from "@/store/useStrikeStore";
import { formatWind, windLabel } from "@/services/weather";
import { moonPhase, skyFromWeatherCode } from "@/services/conditions";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

/**
 * Conditions on the home screen.
 *
 * This was six identical capsules — air, water, wind, pressure, tide, station —
 * wrapped across two rows. Six equal pills are six equal facts, so the eye
 * reached none of them first, and it repeated the pattern the trip card had
 * just stopped using.
 *
 * Now it reads the way an angler asks: the three numbers that decide whether
 * to go out sit across the top, and the rest is a quiet line underneath.
 */

function Column({
  icon, color, label, value, sub,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  color: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.column}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={styles.columnLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.columnValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {sub ? <Text style={styles.columnSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

export function WeatherStrip() {
  const { t } = useTranslation();
  const weather = useStrikeStore((state) => state.weather);
  const waterLevel = useStrikeStore((state) => state.waterLevel);

  if (!weather && !waterLevel) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.empty}>{t("weather.fetching")}</Text>
      </View>
    );
  }

  const phaseLabel = waterLevel
    ? waterLevel.phase === "flooding" ? t("weather.flooding")
      : waterLevel.phase === "ebbing" ? t("weather.ebbing")
      : waterLevel.phase === "highTide" ? t("weather.highTide")
      : t("weather.lowTide")
    : null;

  const sky = skyFromWeatherCode(weather?.weatherCode, weather?.cloudCover);
  // Moon phase needs nothing but the clock, so it is here whether or not the
  // weather request came back.
  const moon = moonPhase(new Date());

  // Pressure, tide, sky, moon and current are context, not headline. They
  // change slowly and nobody decides a session on them alone — but the section
  // is called MILJØDATA, so everything we actually know belongs in it rather
  // than three pills and a heading that overpromises.
  const footnote = [
    sky ? t(`sky.${sky}` as never) : null,
    weather ? `${Math.round(weather.pressure)} hPa` : null,
    waterLevel ? `${waterLevel.level} cm · ${phaseLabel}` : null,
    weather?.currentVelocity != null
      ? `${t("weather.currentShort")} ${
          windLabel(
            weather.currentDirection != null ? String(weather.currentDirection) : null
          ) ?? "–"
        } ${weather.currentVelocity.toFixed(1)} km/t`
      : null,
    `${t(`moon.${moon.key}` as never)} ${Math.round(moon.illumination * 100)}%`,
    waterLevel?.stationName ?? null
  ].filter(Boolean).join("   ·   ");

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {weather ? (
          <Column
            icon="thermometer-outline"
            color="#F2A03D"
            label={t("weather.airLabel")}
            value={`${Math.round(weather.airTemp)}°`}
          />
        ) : null}
        {weather?.waterTemp != null ? (
          <>
            <View style={styles.divider} />
            <Column
              icon="water-outline"
              color="#6FA8DC"
              label={t("weather.waterLabel")}
              value={`${Math.round(weather.waterTemp)}°`}
            />
          </>
        ) : null}
        {weather ? (
          <>
            <View style={styles.divider} />
            <Column
              icon="navigate-outline"
              color="#7FC8A9"
              label={t("weather.windLabel")}
              value={`${Math.round(weather.windSpeed)}`}
              sub={formatWind(weather).split(" ")[0]}
            />
          </>
        ) : null}
      </View>
      {footnote ? <Text style={styles.footnote} numberOfLines={3}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: 6,
    backgroundColor: Colors.border,
  },
  column: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  columnLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  columnValue: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 20,
    letterSpacing: 0,
  },
  columnSub: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  footnote: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    textAlign: "center",
  },
  empty: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },
});
