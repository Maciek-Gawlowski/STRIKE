import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";

type BlockProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * A grey placeholder shaped like the content that is about to appear.
 *
 * Screens used to render their empty state ("No trips yet") or a bare line of
 * text while the database was still being read, then jump to the real content
 * a moment later. A placeholder in the right shape says "loading" without
 * saying anything untrue, and the content lands where the eye already is.
 */
export function SkeletonBlock({ width = "100%", height, radius = 10, style }: BlockProps) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius: radius, opacity: pulse }, style]}
    />
  );
}

/** A card-shaped group of placeholder lines, for list rows and summary cards. */
export function SkeletonCard({ lines = 2, height }: { lines?: number; height?: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={[styles.card, height != null ? { height } : null]}
      accessibilityRole="progressbar"
      accessibilityLabel={t("common.loading")}
    >
      <SkeletonBlock width="55%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} width={i === lines - 1 ? "35%" : "80%"} height={12} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Colors.teal
  },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  }
});
