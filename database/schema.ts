import type { SQLiteDatabase } from "expo-sqlite";

/**
 * SQLite schema for STRIKE.
 *
 * The schema follows the spec (trips / events / weather_snapshots). Two columns
 * exist beyond the spec so the current UI keeps working without any visual
 * change:
 *   - trips.steps        -> the home/summary screens display a "Steps" metric.
 *   - events.sync_status -> offline-first marker for the future Supabase sync.
 *
 * `events.released` stores the inverse of the in-memory `kept` flag
 * (released = !kept); see queries.ts for the mapping.
 *
 * Migrations are versioned via PRAGMA user_version and applied incrementally, so
 * a fresh install (baseline tables) and an existing install converge on the same
 * schema through the same ALTER steps.
 *   v2 -> events.privacy_level, default 'private' for all existing/new rows.
 *   v3 -> privacy model simplified to 'zone' | 'exact'. Existing values are
 *         migrated: private/area_only -> 'zone', public -> 'exact'. New rows
 *         default to 'zone' (enforced at the app layer; every catch contributes
 *         to the Bite Map).
 *   v4 -> event type 'lost' removed. Existing 'lost' events become 'contact'
 *         (a lost fish was already a contact). Also privacy collapses to
 *         area-level: any 'exact' privacy_level becomes 'zone'.
 *   v5 -> events.length_cm and events.weight_kg added (both REAL NULL).
 *         Optional — nobody weighs a catch-and-release fish on the spot.
 */

export const SCHEMA_VERSION = 5;

export const CREATE_TRIPS_TABLE = `
  CREATE TABLE IF NOT EXISTS trips (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT,
    start_time  TEXT NOT NULL,
    end_time    TEXT,
    distance    REAL NOT NULL DEFAULT 0,
    duration    INTEGER,
    steps       INTEGER NOT NULL DEFAULT 0,
    route_json  TEXT NOT NULL DEFAULT '[]'
  );
`;

export const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY NOT NULL,
    trip_id      TEXT NOT NULL,
    type         TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    lat          REAL NOT NULL,
    lng          REAL NOT NULL,
    photo_uri    TEXT,
    species      TEXT,
    comment      TEXT,
    released     INTEGER,
    sync_status  TEXT NOT NULL DEFAULT 'pending',
    length_cm    REAL,
    weight_kg    REAL,
    FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE
  );
`;

export const CREATE_WEATHER_SNAPSHOTS_TABLE = `
  CREATE TABLE IF NOT EXISTS weather_snapshots (
    id             TEXT PRIMARY KEY NOT NULL,
    event_id       TEXT NOT NULL,
    air_temp       REAL,
    water_temp     REAL,
    wind_speed     REAL,
    wind_direction TEXT,
    pressure       REAL,
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
  );
`;

export const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_events_trip_id ON events (trip_id);
  CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events (sync_status);
  CREATE INDEX IF NOT EXISTS idx_weather_event_id ON weather_snapshots (event_id);
`;

/** Returns true if `column` already exists on `table`. */
async function columnExists(
  db: SQLiteDatabase,
  table: string,
  column: string
): Promise<boolean> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return columns.some((entry) => entry.name === column);
}

/**
 * Creates all tables/indexes if they do not yet exist, applies incremental
 * migrations based on PRAGMA user_version, and stamps the latest version.
 * Safe to run on every app start.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    ${CREATE_TRIPS_TABLE}
    ${CREATE_EVENTS_TABLE}
    ${CREATE_WEATHER_SNAPSHOTS_TABLE}
    ${CREATE_INDEXES}
  `);

  const result = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  let current = result?.user_version ?? 0;

  // v2: per-event privacy level. Existing rows default to 'private' so no spot
  // is ever exposed without an explicit choice. The column check keeps the ALTER
  // idempotent regardless of how the DB reached this point.
  if (current < 2) {
    if (!(await columnExists(db, "events", "privacy_level"))) {
      await db.execAsync(
        "ALTER TABLE events ADD COLUMN privacy_level TEXT NOT NULL DEFAULT 'private';"
      );
    }
    current = 2;
  }

  // v3: simplify the privacy model to 'zone' | 'exact'. Map legacy values so no
  // existing catch is left with an unknown level. New rows are written as 'zone'
  // by the app layer.
  if (current < 3) {
    await db.execAsync(`
      UPDATE events SET privacy_level = 'zone' WHERE privacy_level IN ('private', 'area_only');
      UPDATE events SET privacy_level = 'exact' WHERE privacy_level = 'public';
    `);
    current = 3;
  }

  // v4: drop the 'lost' event type (a lost fish was already a contact) and
  // collapse privacy to area-level only ('exact' -> 'zone').
  if (current < 4) {
    await db.execAsync(`
      UPDATE events SET type = 'contact' WHERE type = 'lost';
      UPDATE events SET privacy_level = 'zone' WHERE privacy_level = 'exact';
    `);
    current = 4;
  }

  // v5: optional length and weight fields for catches.
  if (current < 5) {
    if (!(await columnExists(db, "events", "length_cm"))) {
      await db.execAsync("ALTER TABLE events ADD COLUMN length_cm REAL;");
    }
    if (!(await columnExists(db, "events", "weight_kg"))) {
      await db.execAsync("ALTER TABLE events ADD COLUMN weight_kg REAL;");
    }
    current = 5;
  }

  if (current !== SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}
