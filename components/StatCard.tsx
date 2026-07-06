import { type ReactNode } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { GlassCard } from "@/components/GlassCard";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Glass card preset for personal-stats / summary sections.
 * Thin wrapper around GlassCard with consistent padding so stat screens
 * don't need to repeat the layout.
 */
export function StatCard({ children, style }: Props) {
  return (
    <GlassCard style={StyleSheet.flatten([styles.base, style])}>
      {children}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 22
  }
});
