import { getDb } from "@/database/db";

/**
 * Statistics service. Every metric is computed directly from SQLite (never from
 * the Zustand store). All figures are derived from **completed** trips
 * (end_time IS NOT NULL) and their events, so trip counts, event counts, and the
 * ratios between them stay consistent. `getStatistics()` resolves to `null` when
 * there are no completed trips yet (empty state).
 */

export type WindDirectionCount = { direction: string; count: number };
export type WaterTempBucket = { range: string; count: number };
export type LongestTrip = { date: string; distance: number; duration: string };
export type BestTrip = { date: string; catches: number; contacts: number };

export type Statistics = {
  totalTrips: number;
  totalCatches: number;
  totalContacts: number;
  totalFollowing: number;
  catchesPerTrip: number;
  contactsPerTrip: number;
  avgDistanceBetweenContacts: number | null; // km per contact
  avgTimeBetweenContacts: number | null; // minutes per contact
  bestTimeOfDay: string | null; // e.g. "06:00-09:00"
  catchesByWindDirection: WindDirectionCount[];
  catchesByWaterTemp: WaterTempBucket[];
  totalDistance: number; // km
  totalHours: number;
  longestTrip: LongestTrip | null;
  bestTrip: BestTrip | null;
};

const WATER_TEMP_RANGES = ["<8°C", "8-12°C", "12-16°C", ">16°C"] as const;

function waterTempBucket(temp: number): string {
  if (temp < 8) {
    return WATER_TEMP_RANGES[0];
  }
  if (temp < 12) {
    return WATER_TEMP_RANGES[1];
  }
  if (temp < 16) {
    return WATER_TEMP_RANGES[2];
  }
  return WATER_TEMP_RANGES[3];
}

function formatTripDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.round((safe % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

/** Buckets event hours-of-day (local) into 3h windows; returns the busiest. */
function bestTimeWindow(hours: number[]): string | null {
  if (hours.length === 0) {
    return null;
  }
  const buckets = new Array(8).fill(0) as number[];
  for (const hour of hours) {
    const index = Math.floor(((hour % 24) + 24) % 24 / 3);
    buckets[index] += 1;
  }
  let bestIndex = 0;
  for (let i = 1; i < buckets.length; i += 1) {
    if (buckets[i] > buckets[bestIndex]) {
      bestIndex = i;
    }
  }
  if (buckets[bestIndex] === 0) {
    return null;
  }
  const start = bestIndex * 3;
  const end = start + 3;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(start)}:00-${pad(end)}:00`;
}

export async function getStatistics(): Promise<Statistics | null> {
  const db = await getDb();

  // Trip totals (completed trips only).
  const tripTotals = await db.getFirstAsync<{
    trips: number;
    distance: number;
    duration: number;
  }>(
    `SELECT COUNT(*) AS trips,
            COALESCE(SUM(distance), 0) AS distance,
            COALESCE(SUM(duration), 0) AS duration
     FROM trips
     WHERE end_time IS NOT NULL;`
  );

  const totalTrips = tripTotals?.trips ?? 0;
  if (totalTrips === 0) {
    return null;
  }

  const totalDistanceMeters = tripTotals?.distance ?? 0;
  const totalDurationSeconds = tripTotals?.duration ?? 0;
  const totalDistance = totalDistanceMeters / 1000;
  const totalHours = totalDurationSeconds / 3600;

  // Event counts by type (completed trips only).
  const eventCountRows = await db.getAllAsync<{ type: string; count: number }>(
    `SELECT e.type AS type, COUNT(*) AS count
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     WHERE t.end_time IS NOT NULL
     GROUP BY e.type;`
  );
  const countByType: Record<string, number> = {};
  for (const row of eventCountRows) {
    countByType[row.type] = row.count;
  }
  const totalCatches = countByType.catch ?? 0;
  const totalContacts = countByType.contact ?? 0;
  const totalFollowing = countByType.following ?? 0;

  // Best time of day (based on catches).
  const catchTimes = await db.getAllAsync<{ timestamp: string }>(
    `SELECT e.timestamp AS timestamp
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch';`
  );
  const bestTimeOfDay = bestTimeWindow(catchTimes.map((row) => new Date(row.timestamp).getHours()));

  // Catches by wind direction (compass label stored in weather_snapshots).
  const catchesByWindDirection = await db.getAllAsync<WindDirectionCount>(
    `SELECT w.wind_direction AS direction, COUNT(*) AS count
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN weather_snapshots w ON w.event_id = e.id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND w.wind_direction IS NOT NULL
     GROUP BY w.wind_direction
     ORDER BY count DESC;`
  );

  // Catches by water temperature.
  const waterTempRows = await db.getAllAsync<{ temp: number }>(
    `SELECT w.water_temp AS temp
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN weather_snapshots w ON w.event_id = e.id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND w.water_temp IS NOT NULL;`
  );
  const tempCounts = new Map<string, number>(WATER_TEMP_RANGES.map((range) => [range, 0]));
  for (const row of waterTempRows) {
    const bucket = waterTempBucket(row.temp);
    tempCounts.set(bucket, (tempCounts.get(bucket) ?? 0) + 1);
  }
  const catchesByWaterTemp: WaterTempBucket[] = WATER_TEMP_RANGES.map((range) => ({
    range,
    count: tempCounts.get(range) ?? 0
  }));

  // Longest trip (by distance).
  const longestRow = await db.getFirstAsync<{
    start_time: string;
    distance: number;
    duration: number | null;
  }>(
    `SELECT start_time, distance, duration
     FROM trips
     WHERE end_time IS NOT NULL
     ORDER BY distance DESC
     LIMIT 1;`
  );
  const longestTrip: LongestTrip | null = longestRow
    ? {
        date: longestRow.start_time,
        distance: longestRow.distance / 1000,
        duration: formatTripDuration(longestRow.duration ?? 0)
      }
    : null;

  // Best trip (most catches, contacts as tie-breaker).
  const bestRow = await db.getFirstAsync<{
    date: string;
    catches: number;
    contacts: number;
  }>(
    `SELECT t.start_time AS date,
            SUM(CASE WHEN e.type = 'catch' THEN 1 ELSE 0 END) AS catches,
            SUM(CASE WHEN e.type = 'contact' THEN 1 ELSE 0 END) AS contacts
     FROM trips t
     LEFT JOIN events e ON e.trip_id = t.id
     WHERE t.end_time IS NOT NULL
     GROUP BY t.id
     ORDER BY catches DESC, contacts DESC
     LIMIT 1;`
  );
  const bestTrip: BestTrip | null = bestRow
    ? { date: bestRow.date, catches: bestRow.catches ?? 0, contacts: bestRow.contacts ?? 0 }
    : null;

  return {
    totalTrips,
    totalCatches,
    totalContacts,
    totalFollowing,
    catchesPerTrip: totalCatches / totalTrips,
    contactsPerTrip: totalContacts / totalTrips,
    avgDistanceBetweenContacts: totalContacts > 0 ? totalDistance / totalContacts : null,
    avgTimeBetweenContacts: totalContacts > 0 ? (totalHours * 60) / totalContacts : null,
    bestTimeOfDay,
    catchesByWindDirection,
    catchesByWaterTemp,
    totalDistance,
    totalHours,
    longestTrip,
    bestTrip
  };
}
