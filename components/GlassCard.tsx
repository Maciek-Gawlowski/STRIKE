import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Colors } from "@/theme/colors";

type Props = {
  glow?: boolean;
  style?: ViewStyle;
  children: ReactNode;
};

/**
 * Frosted-glass surface card. Use glow=true for attention-grabbing cards
 * (TODAY strip, active-state summary). Callers pass layout-only styles
 * (padding, gap, borderRadius overrides) via the style prop; visual surface
 * tokens (bg, border, shadow) are owned by GlassCard.
 */
export function GlassCard({ glow = false, style, children }: Props) {
  return (
    <View style={[styles.base, glow && styles.glow, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 22,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden"
  },
  glow: {
    shadowColor: Colors.glowAmber,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  }
});
