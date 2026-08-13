import { latLngToCell } from "@/services/hexGrid";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Coordinate, StrikeEvent, StrikeEventType, Trip } from "@/store/useStrikeStore";

/**
 * Data access layer. Everything that maps between the in-memory domain model
 * (Trip / StrikeEvent, used by the Zustand store and the screens) and the SQLite
 * rows lives here. The store never writes raw SQL.
 */

// --- Row shapes -------------------------------------------------------------

type TripRow = {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  distance: number;
  duration: number | null;
  steps: number;
  route_json: string;
  current_lure_id: string | null;
};

type EventRow = {
  id: string;
  trip_id: string;
  type: string;
  timestamp: string;
  lat: number;
  lng: number;
  photo_uri: string | null;
  species: string | null;
  comment: string | null;
  released: number | null;
  sync_status: string;
  privacy_level: string | null;
  length_cm: number | null;
  weight_kg: number | null;
  lure_id: string | null;
  h3_cell: string | null;
};

export type WeatherSnapshot = {
  id: string;
  eventId: string;
  airTemp?: number;
  waterTemp?: number;
  windSpeed?: number;
  windDirection?: string;
  pressure?: number;
};

// --- Mappers ----------------------------------------------------------------

function parseRoute(routeJson: string): Coordinate[] {
  try {
    const parsed = JSON.parse(routeJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToEvent(row: EventRow): StrikeEvent {
  // `released` is the inverse of the UI's `kept` flag. NULL means the event has
  // no kept/released semantics (contact / following).
  const kept = row.released === null ? undefined : row.released === 0;
  return {
    id: row.id,
    type: row.type as StrikeEventType,
    timestamp: row.timestamp,
    position: { latitude: row.lat, longitude: row.lng },
    photoUri: row.photo_uri ?? undefined,
    species: row.species ?? undefined,
    comment: row.comment ?? undefined,
    kept,
    lengthCm: row.length_cm ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    lureId: row.lure_id ?? undefined,
  };
}

function rowToTrip(row: TripRow, events: StrikeEvent[]): Trip {
  return {
    id: row.id,
    title: row.name ?? "",
    startedAt: row.start_time,
    endedAt: row.end_time ?? undefined,
    route: parseRoute(row.route_json),
    events,
    distanceMeters: row.distance,
    steps: row.steps,
    currentLureId: row.current_lure_id ?? undefined
  };
}

function durationSeconds(trip: Trip): number | null {
  if (!trip.endedAt) {
    return null;
  }
  return Math.round((new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 1000);
}

function keptToReleased(kept: boolean | undefined): number | null {
  if (kept === undefined) {
    return null;
  }
  return kept ? 0 : 1;
}

// --- Trip writes ------------------------------------------------------------

/**
 * Inserts a trip or updates it in place. Uses ON CONFLICT ... DO UPDATE rather
 * than INSERT OR REPLACE so the existing row is never deleted (a REPLACE would
 * cascade-delete the trip's events).
 */
export async function upsertTrip(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.runAsync(
    `INSERT INTO trips (id, name, start_time, end_time, distance, duration, steps, route_json, current_lure_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       distance = excluded.distance,
       duration = excluded.duration,
       steps = excluded.steps,
       route_json = excluded.route_json,
       current_lure_id = excluded.current_lure_id;`,
    [
      trip.id,
      trip.title,
      trip.startedAt,
      trip.endedAt ?? null,
      trip.distanceMeters,
      durationSeconds(trip),
      trip.steps,
      JSON.stringify(trip.route),
      trip.currentLureId ?? null
    ]
  );
}

export async function updateTripLure(db: SQLiteDatabase, tripId: string, lureId: string | null): Promise<void> {
  await db.runAsync("UPDATE trips SET current_lure_id = ? WHERE id = ?;", [lureId, tripId]);
}

// --- Event writes -----------------------------------------------------------

export async function upsertEvent(
  db: SQLiteDatabase,
  tripId: string,
  event: StrikeEvent,
  h3Cell?: string,
  syncStatus: "pending" | "synced" = "pending"
): Promise<void> {
  const cell = h3Cell ?? latLngToCell(event.position.latitude, event.position.longitude);
  await db.runAsync(
    `INSERT INTO events (id, trip_id, type, timestamp, lat, lng, photo_uri, species, comment, released, sync_status, privacy_level, length_cm, weight_kg, lure_id, h3_cell)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       type = excluded.type,
       timestamp = excluded.timestamp,
       lat = excluded.lat,
       lng = excluded.lng,
       photo_uri = excluded.photo_uri,
       species = excluded.species,
       comment = excluded.comment,
       released = excluded.released,
       sync_status = excluded.sync_status,
       privacy_level = excluded.privacy_level,
       length_cm = excluded.length_cm,
       weight_kg = excluded.weight_kg,
       lure_id = excluded.lure_id,
       h3_cell = excluded.h3_cell;`,
    [
      event.id,
      tripId,
      event.type,
      event.timestamp,
      event.position.latitude,
      event.position.longitude,
      event.photoUri ?? null,
      event.species ?? null,
      event.comment ?? null,
      keptToReleased(event.kept),
      syncStatus,
      "zone",
      event.lengthCm ?? null,
      event.weightKg ?? null,
      event.lureId ?? null,
      cell,
    ]
  );
}

/**
 * Persists a complete trip and all of its events in a single transaction.
 * Used by stopTrip and by demo seeding.
 */
export async function saveTripWithEvents(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.withTransactionAsync(async () => {
    await upsertTrip(db, trip);
    for (const event of trip.events) {
      await upsertEvent(db, trip.id, event);
    }
  });
}

// --- Reads ------------------------------------------------------------------

async function getEventsForTrip(db: SQLiteDatabase, tripId: string): Promise<StrikeEvent[]> {
  const rows = await db.getAllAsync<EventRow>(
    "SELECT * FROM events WHERE trip_id = ? ORDER BY timestamp ASC;",
    [tripId]
  );
  return rows.map(rowToEvent);
}

async function hydrateTrip(db: SQLiteDatabase, row: TripRow): Promise<Trip> {
  const events = await getEventsForTrip(db, row.id);
  return rowToTrip(row, events);
}

/** Completed trips (end_time set), newest first — matches the in-memory order. */
export async function getCompletedTrips(db: SQLiteDatabase): Promise<Trip[]> {
  const rows = await db.getAllAsync<TripRow>(
    "SELECT * FROM trips WHERE end_time IS NOT NULL ORDER BY start_time DESC;"
  );
  return Promise.all(rows.map((row) => hydrateTrip(db, row)));
}

/** The single in-progress trip (no end_time), if the app was closed mid-trip. */
export async function getActiveTrip(db: SQLiteDatabase): Promise<Trip | null> {
  const row = await db.getFirstAsync<TripRow>(
    "SELECT * FROM trips WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1;"
  );
  return row ? hydrateTrip(db, row) : null;
}

export async function deleteTrip(db: SQLiteDatabase, tripId: string): Promise<void> {
  // ON DELETE CASCADE on events + weather_snapshots handles child rows.
  await db.runAsync("DELETE FROM trips WHERE id = ?;", [tripId]);
}

export async function deleteEvent(db: SQLiteDatabase, eventId: string): Promise<void> {
  // ON DELETE CASCADE on weather_snapshots handles the child row.
  await db.runAsync("DELETE FROM events WHERE id = ?;", [eventId]);
}

export async function renameTripInDb(db: SQLiteDatabase, tripId: string, name: string): Promise<void> {
  await db.runAsync("UPDATE trips SET name = ? WHERE id = ?;", [name, tripId]);
}

export async function queueBiteMapDelete(db: SQLiteDatabase, eventIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const eventId of eventIds) {
    await db.runAsync(
      "INSERT OR IGNORE INTO bite_map_delete_queue (local_event_id, queued_at) VALUES (?, ?);",
      [eventId, now]
    );
  }
}

export async function getBiteMapDeleteQueue(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ local_event_id: string }>(
    "SELECT local_event_id FROM bite_map_delete_queue;"
  );
  return rows.map((r) => r.local_event_id);
}

export async function clearBiteMapDeleteQueue(db: SQLiteDatabase, eventIds: string[]): Promise<void> {
  for (const eventId of eventIds) {
    await db.runAsync("DELETE FROM bite_map_delete_queue WHERE local_event_id = ?;", [eventId]);
  }
}

// --- Feedback queue ---------------------------------------------------------

export type FeedbackData = {
  id: string;
  message: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  deviceModel: string;
  localUserId: string;
};

export async function queueFeedback(db: SQLiteDatabase, row: FeedbackData): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO feedback_queue
       (id, message, app_version, build_number, platform, device_model, local_user_id, queued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [row.id, row.message, row.appVersion, row.buildNumber, row.platform, row.deviceModel, row.localUserId, new Date().toISOString()]
  );
}

export async function getFeedbackQueue(db: SQLiteDatabase): Promise<FeedbackData[]> {
  const rows = await db.getAllAsync<{
    id: string;
    message: string;
    app_version: string;
    build_number: string;
    platform: string;
    device_model: string;
    local_user_id: string;
  }>("SELECT * FROM feedback_queue;");
  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    appVersion: r.app_version,
    buildNumber: r.build_number,
    platform: r.platform,
    deviceModel: r.device_model,
    localUserId: r.local_user_id
  }));
}

export async function clearFeedbackQueueItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM feedback_queue WHERE id = ?;", [id]);
}

export async function countTrips(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM trips;");
  return row?.count ?? 0;
}

// --- Offline sync scaffolding (not connected yet) ---------------------------

/** Events still waiting to be pushed to the backend. */
export async function getPendingEvents(db: SQLiteDatabase): Promise<StrikeEvent[]> {
  const rows = await db.getAllAsync<EventRow>(
    "SELECT * FROM events WHERE sync_status = 'pending' ORDER BY timestamp ASC;"
  );
  return rows.map(rowToEvent);
}

export async function markEventSynced(db: SQLiteDatabase, eventId: string): Promise<void> {
  await db.runAsync("UPDATE events SET sync_status = 'synced' WHERE id = ?;", [eventId]);
}

export type EventLocation = {
  id: string;
  latitude: number;
  longitude: number;
};

/**
 * Events that have no weather snapshot yet (e.g. created while offline).
 * Used by the background weather sync to back-fill conditions once online.
 */
export async function getEventsMissingWeather(db: SQLiteDatabase): Promise<EventLocation[]> {
  const rows = await db.getAllAsync<{ id: string; lat: number; lng: number }>(
    `SELECT e.id AS id, e.lat AS lat, e.lng AS lng
     FROM events e
     LEFT JOIN weather_snapshots w ON w.event_id = e.id
     WHERE w.id IS NULL
     ORDER BY e.timestamp ASC;`
  );
  return rows.map((row) => ({ id: row.id, latitude: row.lat, longitude: row.lng }));
}

// --- Weather snapshots (schema present; reserved for future weather capture) -

export async function insertWeatherSnapshot(
  db: SQLiteDatabase,
  snapshot: WeatherSnapshot
): Promise<void> {
  await db.runAsync(
    `INSERT INTO weather_snapshots (id, event_id, air_temp, water_temp, wind_speed, wind_direction, pressure)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       event_id = excluded.event_id,
       air_temp = excluded.air_temp,
       water_temp = excluded.water_temp,
       wind_speed = excluded.wind_speed,
       wind_direction = excluded.wind_direction,
       pressure = excluded.pressure;`,
    [
      snapshot.id,
      snapshot.eventId,
      snapshot.airTemp ?? null,
      snapshot.waterTemp ?? null,
      snapshot.windSpeed ?? null,
      snapshot.windDirection ?? null,
      snapshot.pressure ?? null
    ]
  );
}

export async function getWeatherForEvent(
  db: SQLiteDatabase,
  eventId: string
): Promise<WeatherSnapshot | null> {
  const row = await db.getFirstAsync<{
    id: string;
    event_id: string;
    air_temp: number | null;
    water_temp: number | null;
    wind_speed: number | null;
    wind_direction: string | null;
    pressure: number | null;
  }>("SELECT * FROM weather_snapshots WHERE event_id = ? LIMIT 1;", [eventId]);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    eventId: row.event_id,
    airTemp: row.air_temp ?? undefined,
    waterTemp: row.water_temp ?? undefined,
    windSpeed: row.wind_speed ?? undefined,
    windDirection: row.wind_direction ?? undefined,
    pressure: row.pressure ?? undefined
  };
}
