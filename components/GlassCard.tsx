import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Colors } from "@/theme/colors";

type Props = {
  glow?: boolean;
  style?: ViewStyle;
  children: ReactNode;
};

/**
 * Frosted-glass surface card. Callers pass layout-only styles (padding, gap,
 * borderRadius overrides) via the style prop; visual surface tokens (bg,
 * border) are owned by GlassCard.
 *
 * `glow` stays in the props so existing call sites compile, but it no longer
 * paints an amber halo. Depth here comes from the border against the
 * background, not from a light source that does not exist.
 */
export function GlassCard({ style, children }: Props) {
  return (
    <View style={[styles.base, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden"
  }
});
