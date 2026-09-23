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

  // Background ramp. Deliberately almost flat: the old ramp ran navy into a
  // teal that tinted the bottom of every screen, so the interface itself had a
  // colour and anything placed on it read as stuck on top. A near-neutral
  // ground lets maps, photos and the amber do the colouring — which is exactly
  // why Strava's near-black chrome disappears and its content doesn't.
  bgTop: "#0A121B",
  bgMid: "#0B1521",
  bgBottom: "#0C1825",

  // Text
  text: "#D9DAD5", // body / labels
  textBright: "#F2F3EF", // large titles
  textMuted: "#8A99A6", // subtitles / secondary
  textOnAmber: "#0D1B2A", // text/icons on amber surfaces

  // Surfaces
  card: "#1B3A4B",
  cardElevated: "#21455A",
  pill: "#0D1B2A", // dark pill on a teal card
  field: "rgba(217, 218, 213, 0.06)", // inputs / inactive toggles / icon buttons
  // Cards are separated by being lighter than the ground, not by being drawn
  // around. A visible 1px outline on every card is the single biggest reason
  // an interface reads as boxy rather than composed.
  border: "rgba(217, 218, 213, 0.05)",
  borderStrong: "rgba(217, 218, 213, 0.12)",

  // Functional (kept semantically the same as before)
  amberSoft: "rgba(255, 186, 0, 0.16)", // amber tint backgrounds
  danger: "#F45B5B", // destructive (Stop Trip, Lost Fish)
  dangerSoft: "rgba(244, 91, 91, 0.22)",
  dangerText: "#FFE4E4",

  // Card surface: a step up in lightness from the ground, not a tinted pane.
  glassBg: "#141F2C",
  glassBorder: "rgba(217, 218, 213, 0.05)",
  glowAmber: "rgba(255, 186, 0, 0.24)",     // amber halo (glow=true cards)

  // Activity level colors — Bite Map zone markers and legend
  activityNone: "#5A6B78",
  activityLow: "#4CAF7D",
  activityMid: "#F4C84F",
  activityHigh: "#F45B5B",

  // Lure colour palette — stored as token keys in the DB, resolved to hex for display
  lureGreen:  "#3DAA6A",
  lureBlue:   "#3A7FC1",
  lureRed:    "#D94040",
  lureSilver: "#A8B4BC",
  lureGold:   "#D4A017",
  lureBlack:  "#2B2B2B",
  lureWhite:  "#E8EAE6",
  lurePink:   "#D96FA0",
  lureOrange: "#E07030",
  lureBrown:  "#7A4E2D",

  catchGreen: "#52E090",
  catchText:  "#06231A",
} as const;

export type ColorName = keyof typeof Colors;
