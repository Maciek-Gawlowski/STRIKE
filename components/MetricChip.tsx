import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Props = {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
};

/** Compact icon + label pill used for weather/metric data inside glass cards. */
export function MetricChip({ icon, label }: Props) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={14} color={Colors.text} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.pill
  },
  label: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0
  }
});
