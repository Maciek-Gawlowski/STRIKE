/**
 * What counts as a trip.
 *
 * This lived as a magic number in three places: services/statistics.ts, the
 * Statistics screen, and nowhere at all in the logbook — which is why the
 * logbook cheerfully listed trips the statistics refused to count, and the two
 * screens disagreed in front of the user about how many catches he had.
 *
 * A trip is abandoned rather than long: the app tracks only in the foreground,
 * so a "trip" spanning a night is one somebody forgot to stop, not one that
 * lasted fourteen hours.
 */
export const MAX_TRIP_DURATION_S = 12 * 3600;

/** SQL fragment for a trips table aliased as `t`. */
export const COUNTED_TRIPS_SQL =
  `t.end_time IS NOT NULL AND (t.duration IS NULL OR t.duration <= ${MAX_TRIP_DURATION_S})`;

/** SQL fragment for an unaliased trips table. */
export const COUNTED_TRIPS_SQL_BARE =
  `end_time IS NOT NULL AND (duration IS NULL OR duration <= ${MAX_TRIP_DURATION_S})`;

/**
 * True when a finished trip should appear in lists and statistics alike.
 * An in-progress trip has no end time and is never "counted" — it is shown
 * separately, as the active trip.
 */
export function isCountedTrip(trip: { startedAt: string; endedAt?: string }): boolean {
  if (!trip.endedAt) return false;
  const seconds = (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_TRIP_DURATION_S;
}
