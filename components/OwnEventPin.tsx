import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { EVENT_MARKER_COLORS, EVENT_MARKER_ICONS } from "@/components/eventMarkers";
import { Fonts } from "@/theme/fonts";

type Props = {
  /** The event type this pin stands for — the best one in the group. */
  type: string;
  /** How many of the angler's own events sit in this cell. 1 shows no number. */
  count: number;
};

/**
 * The angler's own event on the Activity Map: the same icon and colour the
 * trip map uses, so a catch is recognisable as a catch wherever it appears.
 *
 * Deliberately ONE view with one background and no absolutely positioned
 * children. react-native-maps rasterises a marker's children into a single
 * image, and an earlier version of this pin — a circle with a count badge
 * hanging off its corner — came out of that process as the badge alone, with
 * the coloured circle missing entirely. A pill that grows to fit its contents
 * cannot lose a layer, because it only has one.
 *
 * It is solid and opaque on purpose: the shared activity layer is large
 * translucent hexagons, and this pin must never read as community data. These
 * are the user's own observations and nobody else can see them.
 */
export function OwnEventPin({ type, count }: Props) {
  const color = EVENT_MARKER_COLORS[type] ?? "#ffffff";
  const icon = EVENT_MARKER_ICONS[type] ?? "ellipse-outline";

  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Ionicons name={icon} size={17} color="#fff" />
      {count > 1 ? (
        <Text style={styles.count}>{count > 99 ? "99+" : count}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 2,
    // White against the dark parts of the map, and bright enough to separate
    // the pill from the pale ones too.
    borderColor: "rgba(255,255,255,0.92)"
  },
  count: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    lineHeight: 17,
    color: "#fff"
  }
});
