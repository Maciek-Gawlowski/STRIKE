/**
 * Trip naming.
 *
 * A trip gets a provisional name the moment it starts, because the user is
 * standing on the beach and will not wait for a GPS fix to press Start. That
 * name is time-of-day only ("Morgentur"), which means several trips in a row
 * can end up with the same title — the logbook then reads as one repeated row.
 *
 * So the place is filled in later: TripWatcher reverse-geocodes the FIRST real
 * fix and renames the trip to "<place> · <time of day>", but only while the
 * title is still the auto-generated one. A title the user typed is never
 * touched.
 */

/** i18n key for the time-of-day part of a trip name. */
export function timeOfDayKey(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 4 && hour < 9) return "home.tripMorning";
  if (hour >= 9 && hour < 12) return "home.tripLateMorning";
  if (hour >= 12 && hour < 14) return "home.tripNoon";
  if (hour >= 14 && hour < 18) return "home.tripAfternoon";
  if (hour >= 18 && hour < 22) return "home.tripEvening";
  return "home.tripNight";
}
