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
  // Compact = smaller secondary button that can share a row of three equally
  // (drops the 47% min width and uses a shorter height / tighter type).
  compact?: boolean;
};

// Brand tones:
//  green  -> primary CTA (Start Fishing Trip) = amber, navy text
//  yellow -> Contact = amber/gold, navy text
//  blue   -> Following = blue, light text
//  catch  -> New Catch = green, navy text
//  red    -> destructive = red, light text (legacy)
//  steel  -> secondary = dark teal, light text (legacy)
const tones = {
  green: ["#FFC42E", "#E0A100"],
  yellow: ["#FFD25A", "#E0A100"],
  red: ["#FF6F61", "#9E2E32"],
  steel: ["#21455A", "#16313F"],
  blue: ["#3A86B0", "#23566F"],
  catch: ["#3FB477", "#2C8459"]
} as const;

const foreground = {
  green: Colors.textOnAmber,
  yellow: Colors.textOnAmber,
  red: "#FFE4E4",
  steel: Colors.text,
  blue: "#EAF4FA",
  catch: "#06231A"
} as const;

export function ActionButton({ label, icon, tone = "steel", onPress, disabled, compact }: ActionButtonProps) {
  const fg = foreground[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        compact && styles.pressableCompact,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      <LinearGradient
        colors={tones[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, compact && styles.buttonCompact]}
      >
        <View style={[styles.iconBubble, compact && styles.iconBubbleCompact]}>
          <Ionicons name={icon} size={compact ? 22 : 25} color={fg} />
        </View>
        <Text style={[styles.label, compact && styles.labelCompact, { color: fg }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minWidth: "47%"
  },
  pressableCompact: {
    minWidth: 0
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }]
  },
  disabled: {
    opacity: 0.42
  },
  button: {
    minHeight: 112,
    borderRadius: 24,
    padding: 18,
    justifyContent: "space-between",
    overflow: "hidden"
  },
  buttonCompact: {
    minHeight: 96,
    borderRadius: 18,
    padding: 12,
    gap: 8
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13, 27, 42, 0.22)"
  },
  iconBubbleCompact: {
    width: 38,
    height: 38,
    borderRadius: 19
  },
  label: {
    fontSize: 19,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  labelCompact: {
    fontSize: 13
  }
});
