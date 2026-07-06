import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const LEVELS = [
  { color: Colors.activityNone, label: "0" },
  { color: Colors.activityLow,  label: "1-3" },
  { color: Colors.activityMid,  label: "4-8" },
  { color: Colors.activityHigh, label: "9+" }
] as const;

/**
 * Four-segment colour bar + labels showing the Bite Map activity scale.
 * Replaces the individual LegendDot rows.
 */
export function GradientLegend() {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {LEVELS.map((level) => (
          <View key={level.label} style={[styles.segment, { backgroundColor: level.color }]} />
        ))}
      </View>
      <View style={styles.labels}>
        {LEVELS.map((level) => (
          <Text key={level.label} style={styles.label}>{level.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6
  },
  bar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    gap: 2
  },
  segment: {
    flex: 1,
    borderRadius: 4
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  label: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    textAlign: "center"
  }
});
