/**
 * Conditions that are calculated rather than fetched.
 *
 * Everything here is derived from values the app already holds — a timestamp,
 * a length and a weight, a WMO code. None of it needs a network call, a
 * database column or a migration, and all of it works on catches logged long
 * before this file existed. That is the whole reason these three live together:
 * the alternative was three more columns that could go stale, disagree with
 * their own source, or quietly stay null on every row written so far.
 */

// --- Moon phase -------------------------------------------------------------

/** A known new moon, used as the origin for the phase calculation. */
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

/** Mean length of a lunation, in days. */
const SYNODIC_MONTH_DAYS = 29.530588853;

const MS_PER_DAY = 86_400_000;

export type MoonPhaseKey =
  | "new"
  | "waxingCrescent"
  | "firstQuarter"
  | "waxingGibbous"
  | "full"
  | "waningGibbous"
  | "lastQuarter"
  | "waningCrescent";

export type MoonPhase = {
  /** 0 at new moon, 0.5 at full, approaching 1 back at new. */
  fraction: number;
  /** How much of the disc is lit, 0–1. */
  illumination: number;
  key: MoonPhaseKey;
};

/**
 * The moon phase at a given moment.
 *
 * Mean-lunation arithmetic, not an ephemeris: it ignores the orbit's
 * eccentricity and can be a few hours out at the quarters. For an angler
 * deciding whether a night was dark or bright that is well inside the margin
 * that matters, and it keeps the whole thing to a dozen lines with no data to
 * keep current.
 */
export function moonPhase(at: Date | string | number): MoonPhase {
  const ms = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const days = (ms - KNOWN_NEW_MOON_MS) / MS_PER_DAY;
  // Modulo twice so dates before the epoch come back positive too.
  const fraction =
    (((days / SYNODIC_MONTH_DAYS) % 1) + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

  // Eight named phases: the four exact ones get a narrow band around them, the
  // crescents and gibbous phases take the wide stretches in between.
  const eighth = 1 / 8;
  const index = Math.floor(fraction / eighth + 0.5) % 8;
  const keys: MoonPhaseKey[] = [
    "new",
    "waxingCrescent",
    "firstQuarter",
    "waxingGibbous",
    "full",
    "waningGibbous",
    "lastQuarter",
    "waningCrescent"
  ];

  return { fraction, illumination, key: keys[index] };
}

// --- Condition factor -------------------------------------------------------

/**
 * Fulton's condition factor: K = 100 · weight(g) / length(cm)³.
 *
 * A measure of how heavy a fish is for its length — around 1.0 is a fish in
 * normal condition, below that a thin one (a spent kelt after spawning), above
 * it a fish feeding well. Returns null unless both measurements exist, because
 * a K computed from a guessed weight is worse than no K at all.
 */
export function fultonK(lengthCm?: number, weightKg?: number): number | null {
  if (!lengthCm || !weightKg || lengthCm <= 0 || weightKg <= 0) return null;
  const grams = weightKg * 1000;
  return (100 * grams) / Math.pow(lengthCm, 3);
}

// --- Sky --------------------------------------------------------------------

export type SkyKey = "clear" | "partly" | "overcast" | "fog" | "rain" | "snow" | "thunder";

/**
 * Turns a WMO weather code — and cloud cover as a fallback — into the handful
 * of states an angler actually distinguishes.
 *
 * The full WMO table has around thirty entries separating, for instance, light
 * drizzle from moderate drizzle. Nobody standing on a beach reports it that
 * finely, and a filter with thirty options is a filter nobody uses.
 */
export function skyFromWeatherCode(code?: number, cloudCover?: number): SkyKey | null {
  if (code == null) {
    if (cloudCover == null) return null;
    if (cloudCover < 25) return "clear";
    if (cloudCover < 75) return "partly";
    return "overcast";
  }
  if (code >= 95) return "thunder";
  if (code >= 71 && code <= 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "overcast";
  return null;
}
