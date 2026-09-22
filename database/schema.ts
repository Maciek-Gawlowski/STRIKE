import { latLngToCell } from "@/services/hexGrid";
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
 *   v6 -> lures table (id, name, is_favourite, created_at), profile table
 *         (single-row, id=1), and events.lure_id (nullable TEXT FK to lures).
 *   v7 -> lures.colour TEXT NULL — stores a lure-palette token key (e.g. "lureGreen").
 *   v8 -> lures.colour_secondary TEXT NULL — optional second tone for two-colour lures.
 *         NOTE: v8 was originally numbered before v9 was written, causing a migration
 *         ordering bug. The fix is v10 below — do NOT change or remove v8.
 *   v9 -> events.h3_cell TEXT NULL — H3 resolution-8 cell index computed from lat/lng.
 *         Backfills existing rows. Used by the Bite Map instead of hardcoded zone_id.
 *  v10 -> lures.colour_secondary re-applied for devices that received v9 before v8
 *         (i.e. devices that already have user_version=9 and missed the v8 block).
 *         Guarded by columnExists — safe to run even if the column already exists.
 *  v11 -> Re-backfill events.h3_cell. v9 wrote old H3 library ids ("88754e6499fffff"
 *         format); the replacement pure-JS grid writes "q,r" format. The two formats
 *         never match, so all v9 cells are cleared and recomputed. Invalid coords
 *         (null/NaN) are skipped; one bad row cannot abort the rest.
 *  v12 -> spots table: private, device-only saved locations. Never uploaded or
 *         included in Bite Map aggregation. Created via CREATE TABLE IF NOT EXISTS
 *         in the initial block; this version just stamps the counter.
 *  v17 -> weather_snapshots.water_level + water_level_trend. Water level was only
 *         ever fetched live for the home screen and thrown away; nothing kept it
 *         against the catch it belonged to. It is one of the conditions anglers
 *         actually filter on, and unlike moon phase it CANNOT be reconstructed
 *         afterwards — a reading taken a week later is a different tide. So the
 *         column goes in before the alpha, even though nothing reads it yet:
 *         every catch logged from now on carries its water level, and the
 *         analysis built on top of it later starts with real history instead of
 *         an empty column.
 */

export const SCHEMA_VERSION = 17;

export const CREATE_TRIPS_TABLE = `
  CREATE TABLE IF NOT EXISTS trips (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT,
    start_time       TEXT NOT NULL,
    end_time         TEXT,
    distance         REAL NOT NULL DEFAULT 0,
    duration         INTEGER,
    steps            INTEGER NOT NULL DEFAULT 0,
    route_json       TEXT NOT NULL DEFAULT '[]',
    current_lure_id  TEXT
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
    lure_id      TEXT,
    h3_cell      TEXT,
    FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE
  );
`;

export const CREATE_LURES_TABLE = `
  CREATE TABLE IF NOT EXISTS lures (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL,
    is_favourite     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    colour           TEXT,
    colour_secondary TEXT
  );
`;

export const CREATE_PROFILE_TABLE = `
  CREATE TABLE IF NOT EXISTS profile (
    id                INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
    display_name      TEXT,
    fishing_type      TEXT,
    preferred_species TEXT
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
    water_level    REAL,
    water_level_trend TEXT,
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
  );
`;

export const CREATE_SPOTS_TABLE = `
  CREATE TABLE IF NOT EXISTS spots (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    lat        REAL NOT NULL,
    lng        REAL NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
  );
`;

export const CREATE_BITE_MAP_DELETE_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS bite_map_delete_queue (
    local_event_id TEXT PRIMARY KEY NOT NULL,
    queued_at      TEXT NOT NULL
  );
`;

export const CREATE_FEEDBACK_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS feedback_queue (
    id            TEXT PRIMARY KEY NOT NULL,
    message       TEXT NOT NULL,
    app_version   TEXT NOT NULL,
    build_number  TEXT NOT NULL,
    platform      TEXT NOT NULL,
    device_model  TEXT NOT NULL,
    local_user_id TEXT NOT NULL,
    queued_at     TEXT NOT NULL
  );
`;

export const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_events_trip_id ON events (trip_id);
  CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events (sync_status);
  CREATE INDEX IF NOT EXISTS idx_weather_event_id ON weather_snapshots (event_id);
  CREATE INDEX IF NOT EXISTS idx_spots_created_at ON spots (created_at);
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
    ${CREATE_LURES_TABLE}
    ${CREATE_PROFILE_TABLE}
    ${CREATE_SPOTS_TABLE}
    ${CREATE_BITE_MAP_DELETE_QUEUE_TABLE}
    ${CREATE_FEEDBACK_QUEUE_TABLE}
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

  // v6: lures + profile tables, plus events.lure_id (nullable FK to lures).
  if (current < 6) {
    // Tables are already created above via CREATE TABLE IF NOT EXISTS; only the
    // new column on events needs an ALTER for existing installs.
    if (!(await columnExists(db, "events", "lure_id"))) {
      await db.execAsync("ALTER TABLE events ADD COLUMN lure_id TEXT;");
    }
    current = 6;
  }

  // v7: lures.colour — token key for the lure-palette colour (nullable).
  if (current < 7) {
    if (!(await columnExists(db, "lures", "colour"))) {
      await db.execAsync("ALTER TABLE lures ADD COLUMN colour TEXT;");
    }
    current = 7;
  }

  // v8: lures.colour_secondary — optional second tone for two-colour lures.
  if (current < 8) {
    if (!(await columnExists(db, "lures", "colour_secondary"))) {
      await db.execAsync("ALTER TABLE lures ADD COLUMN colour_secondary TEXT;");
    }
    current = 8;
  }

  // v9: events.h3_cell — H3 resolution-8 cell index. Backfill existing rows
  // by computing the cell from their stored lat/lng. Rows with invalid coords are
  // skipped; one bad row cannot abort the migration.
  if (current < 9) {
    if (!(await columnExists(db, "events", "h3_cell"))) {
      await db.execAsync("ALTER TABLE events ADD COLUMN h3_cell TEXT;");
    }
    const rows = await db.getAllAsync<{ id: string; lat: number | null; lng: number | null }>(
      "SELECT id, lat, lng FROM events WHERE h3_cell IS NULL;"
    );
    for (const row of rows) {
      if (row.lat == null || row.lng == null || !isFinite(row.lat) || !isFinite(row.lng)) continue;
      try {
        const cell = latLngToCell(row.lat, row.lng);
        await db.runAsync("UPDATE events SET h3_cell = ? WHERE id = ?;", [cell, row.id]);
      } catch {
        // Bad coordinate — leave h3_cell NULL for this row; Bite Map ignores it.
      }
    }
    current = 9;
  }

  // v10: re-apply lures.colour_secondary for devices that were already at v9
  // before v8 was authored, and therefore skipped the v8 block entirely.
  if (current < 10) {
    if (!(await columnExists(db, "lures", "colour_secondary"))) {
      await db.execAsync("ALTER TABLE lures ADD COLUMN colour_secondary TEXT;");
    }
    current = 10;
  }

  // v11: clear old H3 library cell ids ("88754e6499fffff" format) and re-backfill
  // using the pure-JS grid ("q,r" format). The two formats never match, so any row
  // written by v9 must be recomputed. Rows with invalid coords are skipped.
  if (current < 11) {
    await db.execAsync("UPDATE events SET h3_cell = NULL;");
    const rows = await db.getAllAsync<{ id: string; lat: number | null; lng: number | null }>(
      "SELECT id, lat, lng FROM events WHERE lat IS NOT NULL AND lng IS NOT NULL;"
    );
    for (const row of rows) {
      if (row.lat == null || row.lng == null || !isFinite(row.lat) || !isFinite(row.lng)) continue;
      try {
        const cell = latLngToCell(row.lat, row.lng);
        await db.runAsync("UPDATE events SET h3_cell = ? WHERE id = ?;", [cell, row.id]);
      } catch {
        // Bad coordinate — leave h3_cell NULL for this row.
      }
    }
    current = 11;
  }

  // v12: spots table (private, device-only saved locations). The table is created
  // by CREATE TABLE IF NOT EXISTS in the initial block above; nothing to ALTER.
  if (current < 12) {
    current = 12;
  }

  // v13: bite_map_delete_queue table. Persists local_event_id values whose
  // Supabase DELETE failed (offline) so flushBiteMapDeleteQueue() can retry on
  // the next app start. Table is created via CREATE TABLE IF NOT EXISTS above.
  if (current < 13) {
    current = 13;
  }

  // v14: feedback_queue table. Caches alpha-tester feedback that failed to
  // insert to Supabase (offline). Retried by flushFeedbackQueue() on next start.
  if (current < 14) {
    current = 14;
  }

  // v15: trips.current_lure_id — the lure selected at trip start (and changeable
  // mid-trip). Stamped onto every event's lure_id so contacts/follows record it.
  if (current < 15) {
    if (!(await columnExists(db, "trips", "current_lure_id"))) {
      await db.execAsync("ALTER TABLE trips ADD COLUMN current_lure_id TEXT;");
    }
    current = 15;
  }

  // v16: extended profile fields.
  //   fishing_type repurposed: was a single key ("kyst"), now JSON array of method keys.
  //   New columns: water_type, fishing_locations (JSON), photo_uri, gear (JSON).
  if (current < 16) {
    const rows = await db.getAllAsync<{ id: number; fishing_type: string | null }>(
      "SELECT id, fishing_type FROM profile;"
    );
    for (const row of rows) {
      if (row.fishing_type && !row.fishing_type.startsWith("[")) {
        await db.runAsync("UPDATE profile SET fishing_type = ? WHERE id = ?;", [
          JSON.stringify([row.fishing_type]),
          row.id,
        ]);
      }
    }
    if (!(await columnExists(db, "profile", "water_type"))) {
      await db.execAsync("ALTER TABLE profile ADD COLUMN water_type TEXT;");
    }
    if (!(await columnExists(db, "profile", "fishing_locations"))) {
      await db.execAsync("ALTER TABLE profile ADD COLUMN fishing_locations TEXT;");
    }
    if (!(await columnExists(db, "profile", "photo_uri"))) {
      await db.execAsync("ALTER TABLE profile ADD COLUMN photo_uri TEXT;");
    }
    if (!(await columnExists(db, "profile", "gear"))) {
      await db.execAsync("ALTER TABLE profile ADD COLUMN gear TEXT;");
    }
    current = 16;
  }

  // v17: water level recorded alongside the rest of the conditions.
  // Only written when a live reading exists at the moment of the event — the
  // offline back-fill paths leave it null rather than stamp a catch with a tide
  // measured days later.
  if (current < 17) {
    if (!(await columnExists(db, "weather_snapshots", "water_level"))) {
      await db.execAsync("ALTER TABLE weather_snapshots ADD COLUMN water_level REAL;");
    }
    if (!(await columnExists(db, "weather_snapshots", "water_level_trend"))) {
      await db.execAsync("ALTER TABLE weather_snapshots ADD COLUMN water_level_trend TEXT;");
    }
    current = 17;
  }

  if (current !== SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}
