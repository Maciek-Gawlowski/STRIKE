/**
 * Numbers as the reader writes them.
 *
 * Danish uses a decimal comma: "1,57 km", "2,5 kg". The app printed every
 * decimal with a point, which on a Danish screen reads as a thousands
 * separator or as English. These helpers are display-only — nothing stored or
 * sent ever goes through them.
 */

function withSeparator(text: string, locale: string): string {
  return locale.startsWith("da") ? text.replace(".", ",") : text;
}

/** Fixed number of decimals, e.g. formatFixed(1.5, 2, "da") → "1,50". */
export function formatFixed(value: number, digits: number, locale: string): string {
  return withSeparator(value.toFixed(digits), locale);
}

/**
 * At most `maxDigits` decimals and no trailing zeros — for values the angler
 * typed in: 52 stays "52", 2.5 becomes "2,5".
 */
export function formatDecimal(value: number, maxDigits: number, locale: string): string {
  const factor = 10 ** maxDigits;
  return withSeparator(String(Math.round(value * factor) / factor), locale);
}

/**
 * Reads a number typed on a Danish keyboard, whose decimal key gives a comma.
 * parseFloat("2,5") is 2 — the half kilo silently disappeared.
 */
export function parseDecimalInput(text: string): number {
  return parseFloat(text.trim().replace(",", "."));
}
