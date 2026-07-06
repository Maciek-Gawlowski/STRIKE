/**
 * STRIKE brand palette.
 *
 * Deep navy background, dark-teal cards, amber CTAs/highlights, light-grey text.
 * Map marker colors (contact/lost/catch) intentionally live in TripMap and are
 * NOT part of this palette — they must not change.
 */
export const Colors = {
  // Core brand
  navy: "#0D1B2A", // primary background
  teal: "#1B3A4B", // cards / secondary backgrounds
  green: "#4C6B5A", // muted accent / subtle active states
  grey: "#D9DAD5", // primary text / labels
  amber: "#FFBA00", // highlights, CTAs, active state

  // Background ramp (used by the screen gradient — navy shades)
  bgTop: "#0B1622",
  bgMid: "#0D1B2A",
  bgBottom: "#12283A",

  // Text
  text: "#D9DAD5", // body / labels
  textBright: "#F2F3EF", // large titles
  textMuted: "#8A99A6", // subtitles / secondary
  textOnAmber: "#0D1B2A", // text/icons on amber surfaces

  // Surfaces
  card: "#1B3A4B",
  cardElevated: "#21455A",
  pill: "#0D1B2A", // dark pill on a teal card
  field: "rgba(217, 218, 213, 0.08)", // inputs / inactive toggles / icon buttons
  border: "rgba(217, 218, 213, 0.12)",
  borderStrong: "rgba(217, 218, 213, 0.2)",

  // Functional (kept semantically the same as before)
  amberSoft: "rgba(255, 186, 0, 0.16)", // amber tint backgrounds
  danger: "#F45B5B", // destructive (Stop Trip, Lost Fish)
  dangerSoft: "rgba(244, 91, 91, 0.22)",
  dangerText: "#FFE4E4",

  // Glass design system
  glassBg: "rgba(27, 58, 75, 0.72)",       // frosted teal surface
  glassBorder: "rgba(217, 218, 213, 0.15)", // glass-edge highlight
  glowAmber: "rgba(255, 186, 0, 0.24)",     // amber halo (glow=true cards)

  // Activity level colors — Bite Map zone markers and legend
  activityNone: "#5A6B78",
  activityLow: "#4CAF7D",
  activityMid: "#F4C84F",
  activityHigh: "#F45B5B"
} as const;

export type ColorName = keyof typeof Colors;
