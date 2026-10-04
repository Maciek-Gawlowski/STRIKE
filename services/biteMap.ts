import { cellToLatLng } from "@/services/hexGrid";
import type { StrikeEvent } from "@/store/useStrikeStore";
import { supabase } from "./supabase";
import { degreesToCompass, type WeatherData } from "./weather";
import type { SQLiteDatabase } from "expo-sqlite";
import { getBiteMapDeleteQueue, clearBiteMapDeleteQueue, type WeatherSnapshot } from "@/database/queries";
import { recordSyncFailure, recordSyncSuccess } from "./syncStatus";

/**
 * Logs a Bite Map failure without ever throwing.
 *
 * Offline is expected and uninteresting, so a plain network failure is kept
 * quiet. Anything else — a rejected column, an RLS refusal, a missing RPC —
 * is a bug on our side and gets printed with its message, because the only
 * reason those went unnoticed before is that nothing ever printed them.
 */
function warnUpload(stage: string, error: unknown, kind: "read" | "write" = "write"): void {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  if (/network|fetch|timeout|offline/i.test(message ?? "")) return;
  console.warn(`[strike/biteMap] ${stage} failed: ${message}`);
  // Also put it somewhere a person holding the phone can read it. A console
  // warning in a TestFlight build reaches nobody.
  recordSyncFailure(stage, error, kind);
}

/**
 * Bite Map backend access.
 *
 * Contribution model (area-level only): every event uploads its H3 resolution-8
 * cell + coarse context (event type, hour, date, wind, water temp). Exact GPS
 * (lat/lng) is NEVER sent. No user identifier is ever sent. Everything is
 * fire-and-forget and fails silently offline.
 *
 * Supabase schema required (one-time migration, not run from the client):
 *   ALTER TABLE bite_map_events ADD COLUMN h3_cell TEXT;
 *   ALTER TABLE bite_map_events DROP COLUMN zone_id;
 *   CREATE INDEX ON bite_map_events (h3_cell, created_at);
 *
 * Reads and deletes both go through SECURITY DEFINER functions rather than the
 * table. The anon key is embedded in the IPA and can be lifted out of it in a
 * minute, so anything the table allows the anon role to do, a stranger can do:
 * a SELECT policy means every individual observation is readable, and a DELETE
 * policy of USING (true) means one unfiltered statement empties the shared map.
 * bite_map_cells() applies the 3-observation threshold in SQL, where a caller
 * cannot drop the HAVING clause, and delete_bite_map_events() can only remove
 * ids the caller already knows. See 12-supabase-lockdown.sql.
 */

export type HexActivity = {
  h3_cell: string;
  lat: number;
  lng: number;
  catches: number;
  contacts: number;
  total: number;
};

export type BiteMapHours = 24 | 48 | 168;

export type BiteMapFilter = {
  since: string;
  until?: string;
  species?: string | null;
  eventTypes?: string[];
};

/**
 * Uploads a single anonymous area-level activity event. h3Cell is the
 * resolution-8 H3 index of the event position — never exact coordinates.
 */
export async function uploadBiteMapEvent(
  event: StrikeEvent,
  h3Cell: string,
  weather: WeatherData | null
): Promise<void> {
  try {
    if (!supabase) return;
    const timestamp = new Date(event.timestamp);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("bite_map_events") as any).insert({
      local_event_id: event.id,
      h3_cell: h3Cell,
      event_type: event.type,
      species: event.type === "catch" ? (event.species ?? null) : null,
      hour_of_day: timestamp.getHours(),
      date: timestamp.toISOString().slice(0, 10),
      wind_direction: weather ? degreesToCompass(weather.windDirection) : null,
      water_temp: weather?.waterTemp ?? null,
    });
    recordSyncSuccess("write");
  } catch (error) {
    // Never throw: an upload failing must not break a trip in progress.
    // But it must not be invisible either. A silent catch here hid a schema
    // mismatch for weeks — the table had zone_id NOT NULL and no h3_cell, so
    // every insert was rejected and the Activity Map stayed empty while the
    // app looked like it was working.
    warnUpload("upload", error);
  }
}

/**
 * Deletes Bite Map rows by local_event_id. Throws on network failure so the
 * caller can queue the ids for retry via queueBiteMapDelete.
 */
export async function deleteBiteMapEvents(eventIds: string[]): Promise<void> {
  if (!supabase || eventIds.length === 0) return;
  // The function caps the array at 500; a single trip is nowhere near that,
  // but chunk anyway so a bulk delete of old trips cannot trip the limit.
  for (let i = 0; i < eventIds.length; i += 400) {
    const chunk = eventIds.slice(i, i + 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("delete_bite_map_events", {
      p_ids: chunk
    });
    if (error) throw error;
  }
}

/**
 * Retries any Bite Map deletes that were queued due to an offline failure.
 * Called once on app start (hydrateStore). Fire-and-forget — never throws.
 */
export async function flushBiteMapDeleteQueue(db: SQLiteDatabase): Promise<void> {
  try {
    const ids = await getBiteMapDeleteQueue(db);
    if (ids.length === 0) return;
    await deleteBiteMapEvents(ids);
    await clearBiteMapDeleteQueue(db, ids);
  } catch (error) {
    warnUpload("delete-queue-flush", error);
    // Still offline — leave queued for the next app start.
  }
}

/**
 * Delete + re-insert a Bite Map row after an edit that changed an uploaded field.
 * Uses the stored WeatherSnapshot (windDirection as degrees string, waterTemp as number).
 * Best-effort — never throws.
 */
export async function resyncBiteMapEvent(
  event: StrikeEvent,
  h3Cell: string,
  weather: WeatherSnapshot | null
): Promise<void> {
  if (!supabase) return;
  try {
    await deleteBiteMapEvents([event.id]);
  } catch (error) {
    // Offline — re-insert anyway. The unique index on local_event_id makes
    // that safe: a duplicate is rejected rather than silently doubling the
    // event's weight on the shared map.
    warnUpload("resync-delete", error);
  }
  try {
    const timestamp = new Date(event.timestamp);
    const windDegrees = weather?.windDirection != null ? parseFloat(weather.windDirection) : NaN;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("bite_map_events") as any).insert({
      local_event_id: event.id,
      h3_cell: h3Cell,
      event_type: event.type,
      species: event.type === "catch" ? (event.species ?? null) : null,
      hour_of_day: timestamp.getHours(),
      date: timestamp.toISOString().slice(0, 10),
      wind_direction: !isNaN(windDegrees) ? degreesToCompass(windDegrees) : null,
      water_temp: weather?.waterTemp ?? null,
    });
  } catch (error) {
    warnUpload("resync-insert", error);
  }
}

/**
 * Fetches activity aggregated by H3 cell for the given time window. Returns an
 * empty array when Supabase is unreachable or not configured — callers fall back
 * to mock data.
 */
export async function getBiteMapData(filter: BiteMapFilter): Promise<HexActivity[]> {
  try {
    if (!supabase) return [];

    // Filtering and aggregation both happen in SQL now. Two things follow:
    // the raw observations never leave the database, and a busy window costs
    // one row per cell instead of one row per event — which matters on a phone
    // holding a bar of signal on a beach.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("bite_map_cells", {
      p_since: filter.since,
      p_until: filter.until ?? null,
      p_species: filter.species ?? null,
      p_event_types:
        filter.eventTypes && filter.eventTypes.length > 0 ? filter.eventTypes : null
    }) as {
      data: Array<{ h3_cell: string; catches: number; contacts: number; total: number }> | null;
      error: unknown;
    };

    if (error) {
      warnUpload("read", error, "read");
      return [];
    }
    // A read proves reads work. It says nothing about whether anything has
    // ever been uploaded, which is why this does not turn the light green.
    recordSyncSuccess("read");
    if (!data || data.length === 0) return [];

    return data.map((row) => {
      const { lat, lng } = cellToLatLng(row.h3_cell);
      return {
        h3_cell: row.h3_cell,
        lat,
        lng,
        catches: row.catches,
        contacts: row.contacts,
        total: row.total
      };
    });
  } catch (error) {
    warnUpload("read", error, "read");
    return [];
  }
}
