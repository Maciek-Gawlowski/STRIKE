/**
 * STRIKE typography.
 *
 * These map to the @expo-google-fonts families loaded (non-blocking) in
 * app/_layout.tsx. Fonts are an OPTIONAL enhancement: if they haven't loaded
 * yet, React Native falls back to the system font for that family and swaps in
 * the brand font once it's ready. The app never waits on them.
 *
 * Both the brand-named keys (headingBlack/headingSemi/…) and the legacy keys
 * (black/semibold/medium/bodySemibold/bodyBold) are kept so every existing
 * `Fonts.*` reference keeps working.
 *
 * Note: only Raleway 400/500/600 are loaded, so `bodyBold` maps to the loaded
 * 600 SemiBold (the heaviest available Raleway weight) rather than a 700 that
 * would silently fall back to the system font.
 */
export const Fonts = {
  // Montserrat — headings, logo, buttons, metric numbers
  headingBlack: "Montserrat_900Black",
  black: "Montserrat_900Black",
  heading: "Montserrat_700Bold",
  headingSemi: "Montserrat_600SemiBold",
  semibold: "Montserrat_600SemiBold",
  headingMedium: "Montserrat_500Medium",
  medium: "Montserrat_500Medium",

  // Raleway — body text and labels
  body: "Raleway_400Regular",
  bodyMedium: "Raleway_500Medium",
  bodySemi: "Raleway_600SemiBold",
  bodySemibold: "Raleway_600SemiBold",
  bodyBold: "Raleway_600SemiBold"
} as const;

export type FontName = keyof typeof Fonts;
