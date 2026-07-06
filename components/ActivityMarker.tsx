import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Props = {
  count: number;
  selected?: boolean;
};

function markerBg(count: number): string {
  if (count >= 9) return Colors.activityHigh;
  if (count >= 4) return Colors.activityMid;
  if (count >= 1) return Colors.activityLow;
  return Colors.activityNone;
}

function markerFg(count: number): string {
  // Dark text on the bright mid/low markers; light on grey and red.
  return count >= 1 && count < 9 ? Colors.navy : Colors.textBright;
}

/**
 * Zone-activity bubble for react-native-maps Marker children.
 * Derives colour from count using the same 0 / 1-3 / 4-8 / 9+ thresholds
 * as the Bite Map legend.
 */
export function ActivityMarker({ count, selected = false }: Props) {
  return (
    <View
      style={[
        styles.bubble,
        { backgroundColor: markerBg(count) },
        selected && styles.selected
      ]}
    >
      <Text style={[styles.count, { color: markerFg(count) }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 6,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(13, 27, 42, 0.5)"
  },
  selected: {
    borderColor: Colors.textBright
  },
  count: {
    fontFamily: Fonts.heading,
    fontSize: 14
  }
});
