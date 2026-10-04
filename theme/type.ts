/**
 * STRIKE type scale.
 *
 * Before this file the app used twenty-four different font sizes — 10, 11, 12,
 * 13, 14, 15, 16, 17, 18, 19, 20, 22, 26, 28, 30, 32, 34, 35, 36, 44, 48, 56 —
 * chosen one at a time as each screen was written. That is the single loudest
 * signal that an interface was assembled rather than designed: nothing lines
 * up, nothing recedes, and every screen has its own idea of what "small" means.
 *
 * Eight steps, each with one job. A size not on this list is a bug unless it
 * is inside an SVG chart or the share-card canvas, both of which are drawn at
 * fixed dimensions and scale on their own terms.
 */
export const Type = {
  /** Hero numbers: catch counts, trip totals. One per screen at most. */
  display: 44,
  /** Secondary large numbers, inside a card rather than owning the screen. */
  displaySmall: 26,
  /** Screen titles. */
  title: 34,
  /** Section and card headings. */
  heading: 20,
  /** Emphasised body: list item titles, button labels. */
  bodyStrong: 17,
  /** Default reading size. */
  body: 15,
  /** Secondary text: dates, hints, metadata. */
  small: 13,
  /** Small caps labels under a number, and nothing else. */
  label: 11
} as const;

export type TypeStep = keyof typeof Type;
