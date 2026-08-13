import { View } from "react-native";
import { Colors } from "@/theme/colors";

export const LURE_COLOUR_KEYS = [
  "lureGreen",
  "lureBlue",
  "lureRed",
  "lureSilver",
  "lureGold",
  "lureBlack",
  "lureWhite",
  "lurePink",
  "lureOrange",
  "lureBrown",
] as const;

export type LureColourKey = (typeof LURE_COLOUR_KEYS)[number];

/** Resolve a stored colour token key to its hex value. */
export function lureColourHex(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return (Colors as Record<string, string>)[key];
}

/**
 * Small filled circle representing a lure colour. When a secondary colour is
 * provided the circle is split diagonally — primary top-left, secondary bottom-right.
 * Renders nothing when the primary key is absent.
 */
export function LureColourDot({
  colourKey,
  colourSecondaryKey,
  size = 14,
}: {
  colourKey: string | undefined;
  colourSecondaryKey?: string | undefined;
  size?: number;
}) {
  const primary = lureColourHex(colourKey);
  if (!primary) return null;

  const secondary = lureColourHex(colourSecondaryKey);

  if (!secondary) {
    // Single-colour plain circle.
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: primary,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.18)",
          overflow: "hidden",
        }}
      />
    );
  }

  // Two-colour diagonal split: primary fills the base; an oversized rotated
  // square of the secondary colour covers the bottom-right triangle.
  const squareSide = size * 1.6;
  const offset = -(squareSide - size) / 2 - size * 0.08;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: primary,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: squareSide,
          height: squareSide,
          backgroundColor: secondary,
          transform: [{ rotate: "45deg" }],
          bottom: offset,
          right: offset,
        }}
      />
    </View>
  );
}
