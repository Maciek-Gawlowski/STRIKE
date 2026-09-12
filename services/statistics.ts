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
  /** 24-element array — catch count per hour of day (0–23), local time. */
  catchHourCounts: number[];
  totalDistance: number; // km
  totalHours: number;
  longestTrip: LongestTrip | null;
  bestTrip: BestTrip | null;
};

const WATER_TEMP_RANGES = ["<8°C", "8-12°C", "12-16°C", ">16°C"] as const;

// Trips longer than this are treated as abandoned/forgotten and excluded from
// averages so a single runaway session doesn't distort catches/trip, km/contact, etc.
const MAX_TRIP_DURATION_S = 12 * 3600;

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

export type StreakData = {
  tripsThisWeek: number;
  consecutiveDays: number;
  bestCatchesTrip: number;
};

export async function getStreakData(): Promise<StreakData> {
  const db = await getDb();

  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM trips WHERE end_time IS NOT NULL AND start_time >= ?`,
    [weekStart.toISOString()]
  );
  const tripsThisWeek = weekRow?.count ?? 0;

  const dateRows = await db.getAllAsync<{ d: string }>(
    `SELECT DISTINCT date(start_time, 'localtime') AS d FROM trips WHERE end_time IS NOT NULL ORDER BY d DESC`
  );
  const dateSet = new Set(dateRows.map((r) => r.d));

  let consecutiveDays = 0;
  const check = new Date(now);
  check.setHours(0, 0, 0, 0);
  if (!dateSet.has(check.toISOString().slice(0, 10))) {
    check.setDate(check.getDate() - 1);
  }
  for (let i = 0; i < 365; i++) {
    const d = check.toISOString().slice(0, 10);
    if (dateSet.has(d)) {
      consecutiveDays++;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }

  const bestRow = await db.getFirstAsync<{ catches: number }>(
    `SELECT COUNT(*) AS catches
     FROM events e JOIN trips t ON t.id = e.trip_id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch'
     GROUP BY e.trip_id
     ORDER BY catches DESC LIMIT 1`
  );
  const bestCatchesTrip = bestRow?.catches ?? 0;

  return { tripsThisWeek, consecutiveDays, bestCatchesTrip };
}

export type BestConditions = {
  waterTempRange: string | null;
  windDirection: string | null;
  windSpeedAvg: number | null;
  pressureAvg: number | null;
};

export async function getBestConditions(): Promise<BestConditions> {
  const db = await getDb();

  const tempRows = await db.getAllAsync<{ temp: number }>(
    `SELECT w.water_temp AS temp
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN weather_snapshots w ON w.event_id = e.id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND w.water_temp IS NOT NULL`
  );

  let waterTempRange: string | null = null;
  if (tempRows.length > 0) {
    const tempCounts = new Map<string, number>(WATER_TEMP_RANGES.map((r) => [r, 0]));
    for (const row of tempRows) {
      const bucket = waterTempBucket(row.temp);
      tempCounts.set(bucket, (tempCounts.get(bucket) ?? 0) + 1);
    }
    let bestRange = "";
    let bestCount = 0;
    for (const [range, count] of tempCounts) {
      if (count > bestCount) { bestCount = count; bestRange = range; }
    }
    if (bestCount > 0) waterTempRange = bestRange;
  }

  const windRow = await db.getFirstAsync<{ direction: string }>(
    `SELECT w.wind_direction AS direction
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN weather_snapshots w ON w.event_id = e.id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND w.wind_direction IS NOT NULL
     GROUP BY w.wind_direction ORDER BY COUNT(*) DESC LIMIT 1`
  );

  const speedRow = await db.getFirstAsync<{ avg: number }>(
    `SELECT AVG(w.wind_speed) AS avg
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN weather_snapshots w ON w.event_id = e.id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND w.wind_speed IS NOT NULL`
  );

  const pressureRow = await db.getFirstAsync<{ avg: number }>(
    `SELECT AVG(w.pressure) AS avg
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN weather_snapshots w ON w.event_id = e.id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND w.pressure IS NOT NULL`
  );

  return {
    waterTempRange,
    windDirection: windRow?.direction ?? null,
    windSpeedAvg: speedRow?.avg != null ? Math.round(speedRow.avg) : null,
    pressureAvg: pressureRow?.avg != null ? Math.round(pressureRow.avg) : null,
  };
}

export type LureStat = {
  lureId: string;
  name: string;
  colour: string | null;
  colourSecondary: string | null;
  catches: number;
};

export async function getLureStats(): Promise<LureStat[]> {
  const db = await getDb();
  return db.getAllAsync<LureStat>(
    `SELECT e.lure_id AS lureId, l.name AS name, l.colour AS colour,
            l.colour_secondary AS colourSecondary, COUNT(*) AS catches
     FROM events e
     JOIN trips t ON t.id = e.trip_id
     JOIN lures l ON l.id = e.lure_id
     WHERE t.end_time IS NOT NULL AND e.type = 'catch' AND e.lure_id IS NOT NULL
     GROUP BY e.lure_id
     ORDER BY catches DESC`
  );
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
     WHERE end_time IS NOT NULL
       AND (duration IS NULL OR duration <= ${MAX_TRIP_DURATION_S});`
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
       AND (t.duration IS NULL OR t.duration <= ${MAX_TRIP_DURATION_S})
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
  const catchHours = catchTimes.map((row) => new Date(row.timestamp).getHours());
  const bestTimeOfDay = bestTimeWindow(catchHours);
  const catchHourCounts = new Array<number>(24).fill(0);
  for (const h of catchHours) catchHourCounts[h] += 1;

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
    catchHourCounts,
    totalDistance,
    totalHours,
    longestTrip,
    bestTrip
  };
}
