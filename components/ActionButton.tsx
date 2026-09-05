import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type ActionButtonProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "green" | "yellow" | "red" | "steel" | "blue" | "catch";
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
};

// Gradient fills per tone.
const tones = {
  green:  ["#FFC42E", "#E0A100"] as const,
  yellow: ["#FFD25A", "#E0A100"] as const,
  red:    ["#FF6F61", "#9E2E32"] as const,
  steel:  ["#21455A", "#16313F"] as const,
  blue:   ["#3A86B0", "#23566F"] as const,
  catch:  [Colors.catchGreen, "#35B56A"] as const,
};

// Text / icon colour on top of each gradient.
const foreground = {
  green:  Colors.textOnAmber,
  yellow: Colors.textOnAmber,
  red:    "#FFE4E4",
  steel:  Colors.text,
  blue:   "#EAF4FA",
  catch:  Colors.catchText,
} as const;

// Glow colour applied as a drop-shadow under the button.
const glowColor = {
  green:  Colors.amber,
  yellow: Colors.amber,
  red:    Colors.danger,
  steel:  "transparent",
  blue:   "#3A86B0",
  catch:  Colors.catchGreen,
} as const;

export function ActionButton({
  label,
  icon,
  tone = "steel",
  onPress,
  disabled,
  compact,
}: ActionButtonProps) {
  const fg = foreground[tone];
  const glow = glowColor[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        compact && styles.pressableCompact,
        // Tonal glow shadow (iOS: shadowColor; Android: elevation).
        { shadowColor: glow, shadowOffset: { width: 0, height: compact ? 8 : 5 },
          shadowOpacity: 0.42, shadowRadius: compact ? 18 : 12, elevation: compact ? 12 : 8 },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <LinearGradient
        colors={tones[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, compact && styles.buttonCompact]}
      >
        {compact ? (
          // Compact: vertical card (icon top, label bottom)
          <>
            <View style={styles.iconBubbleCompact}>
              <Ionicons name={icon} size={22} color={fg} />
            </View>
            <Text style={[styles.labelCompact, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
          </>
        ) : (
          // Full-width: horizontal pill (icon left, label right)
          <>
            <View style={styles.iconBubble}>
              <Ionicons name={icon} size={26} color={fg} />
            </View>
            <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minWidth: "47%",
  },
  pressableCompact: {
    minWidth: 0,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.42,
  },

  // ── Full-width pill (64px horizontal) ──
  button: {
    height: 64,
    borderRadius: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13, 27, 42, 0.22)",
  },
  label: {
    flex: 1,
    fontSize: 17,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
  },

  // ── Compact vertical card ──
  buttonCompact: {
    height: undefined,
    minHeight: 96,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  iconBubbleCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13, 27, 42, 0.22)",
  },
  labelCompact: {
    fontSize: 13,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
    textAlign: "center",
  },
});
