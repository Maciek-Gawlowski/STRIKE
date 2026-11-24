import AsyncStorage from "@react-native-async-storage/async-storage";
import { cellToLatLng } from "@/services/hexGrid";
import type { StrikeEvent } from "@/store/useStrikeStore";
import { supabase } from "./supabase";
import { degreesToCompass, windLabel, type WeatherData } from "./weather";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  clearBiteMapDeleteQueue,
  clearBiteMapUploadQueueItem,
  getBiteMapDeleteQueue,
  getBiteMapUploadQueue,
  getEventForUpload,
  type WeatherSnapshot
} from "@/database/queries";
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

type InsertOutcome = "stored" | "duplicate" | "failed";

type MapRow = {
  local_event_id: string;
  h3_cell: string;
  event_type: string;
  species: string | null;
  hour_of_day: number;
  date: string;
  wind_direction: string | null;
  water_temp: number | null;
};

/**
 * One insert, with its outcome actually read.
 *
 * supabase-js does not throw when the server rejects a row — it resolves with
 * `{ error }`. The old code awaited the insert and called it a success either
 * way, so a rejected upload turned the server-status light green, which is the
 * exact failure that panel was built to catch.
 *
 * A duplicate (Postgres 23505, from the unique index on local_event_id) means
 * the row is already there — a retry of something that had in fact landed —
 * and counts as done.
 */
async function insertMapRow(row: MapRow, stage: string): Promise<InsertOutcome> {
  if (!supabase) return "failed";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = (await (supabase.from("bite_map_events") as any).insert(row)) as {
      error: { code?: string; message?: string } | null;
    };
    if (!error) {
      recordSyncSuccess("write");
      return "stored";
    }
    if (error.code === "23505") return "duplicate";
    warnUpload(stage, error);
    return "failed";
  } catch (error) {
    warnUpload(stage, error);
    return "failed";
  }
}

/**
 * Uploads a single anonymous area-level activity event. h3Cell is the
 * resolution-8 H3 index of the event position — never exact coordinates.
 *
 * Resolves true when the row is on the server (or nothing should be sent) and
 * false when it should be queued for a retry.
 */
export async function uploadBiteMapEvent(
  event: StrikeEvent,
  h3Cell: string,
  weather: WeatherData | null
): Promise<boolean> {
  if (!supabase) return true;
  // Development runs never write to the shared map. Every Expo Go session
  // was pushing test events into the same table real anglers' observations
  // live in, with nothing to tell the two apart afterwards — a handful of
  // catches logged at a desk in one city is noise on everyone else's map and
  // quietly inflates any count we ever quote. The upload path itself is
  // still exercised by TestFlight builds, which is where it gets verified.
  if (__DEV__) {
    console.log("[strike/bitemap] upload skipped — development build");
    return true;
  }
  const timestamp = new Date(event.timestamp);
  const outcome = await insertMapRow(
    {
      local_event_id: event.id,
      h3_cell: h3Cell,
      event_type: event.type,
      species: event.type === "catch" ? (event.species ?? null) : null,
      hour_of_day: timestamp.getHours(),
      date: timestamp.toISOString().slice(0, 10),
      wind_direction: weather ? degreesToCompass(weather.windDirection) : null,
      water_temp: weather?.waterTemp ?? null
    },
    "upload"
  );
  return outcome !== "failed";
}

/**
 * Observations older than this are dropped from the retry queue instead of
 * sent. The map shows at most the last 30 days by default; a month-old catch
 * arriving now would mostly add noise to whatever window it lands in.
 */
const UPLOAD_QUEUE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let uploadFlushRunning = false;

/**
 * Sends observations that could not be uploaded when they were logged.
 *
 * Before this existed, an observation logged without signal — the normal case
 * on half the coast STRIKE is used on — was simply never sent. The trip looked
 * fine on the phone and the Activity Map never heard about it.
 *
 * Reads each event fresh from the database, so edits made since are honoured
 * and a deleted event is dropped rather than resurrected. Stops at the first
 * failure: if one cannot get through, the rest will not either.
 */
export async function flushBiteMapUploadQueue(db: SQLiteDatabase): Promise<void> {
  if (!supabase || __DEV__ || uploadFlushRunning) return;
  uploadFlushRunning = true;
  try {
    const queue = await getBiteMapUploadQueue(db);
    for (const item of queue) {
      const event = await getEventForUpload(db, item.eventId);
      const tooOld = Date.now() - new Date(item.queuedAt).getTime() > UPLOAD_QUEUE_MAX_AGE_MS;
      const isActivity = event?.type === "contact" || event?.type === "following" || event?.type === "catch";
      if (!event || !event.h3Cell || !isActivity || tooOld) {
        await clearBiteMapUploadQueueItem(db, item.eventId);
        continue;
      }
      const timestamp = new Date(event.timestamp);
      const outcome = await insertMapRow(
        {
          local_event_id: event.id,
          h3_cell: event.h3Cell,
          event_type: event.type,
          species: event.type === "catch" ? event.species : null,
          hour_of_day: timestamp.getHours(),
          date: timestamp.toISOString().slice(0, 10),
          wind_direction: windLabel(event.windDirection),
          water_temp: event.waterTemp
        },
        "upload-retry"
      );
      if (outcome === "failed") break;
      await clearBiteMapUploadQueueItem(db, item.eventId);
    }
  } catch (error) {
    warnUpload("upload-queue-flush", error);
  } finally {
    uploadFlushRunning = false;
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
  const timestamp = new Date(event.timestamp);
  await insertMapRow(
    {
      local_event_id: event.id,
      h3_cell: h3Cell,
      event_type: event.type,
      species: event.type === "catch" ? (event.species ?? null) : null,
      hour_of_day: timestamp.getHours(),
      date: timestamp.toISOString().slice(0, 10),
      wind_direction: windLabel(weather?.windDirection),
      water_temp: weather?.waterTemp ?? null
    },
    "resync-insert"
  );
}

/**
 * Fetches activity aggregated by H3 cell for the given time window.
 *
 * Returns null when the read FAILED (offline, timeout, RPC error) and [] only
 * when the server answered with no cells. The two used to be the same value,
 * so one dropped request on a weak connection wiped a map that was on screen a
 * second earlier and replaced it with "no activity here yet" — which is what
 * testers reported as the community map coming and going.
 */
export async function getBiteMapData(filter: BiteMapFilter): Promise<HexActivity[] | null> {
  if (!supabase) return null;
  // One quiet retry. On a beach the first request after waking the phone often
  // dies on a radio that is still coming up; the second one usually lands.
  const first = await readCellsOnce(filter);
  if (first !== null) return first;
  await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS));
  return readCellsOnce(filter);
}

/** A read that hangs is worse than one that fails: the map just sits there. */
const READ_TIMEOUT_MS = 8000;
const READ_RETRY_DELAY_MS = 1200;

async function readCellsOnce(filter: BiteMapFilter): Promise<HexActivity[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    if (!supabase) return null;

    // Filtering and aggregation both happen in SQL now. Two things follow:
    // the raw observations never leave the database, and a busy window costs
    // one row per cell instead of one row per event — which matters on a phone
    // holding a bar of signal on a beach.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .rpc("bite_map_cells", {
        p_since: filter.since,
        p_until: filter.until ?? null,
        p_species: filter.species ?? null,
        p_event_types:
          filter.eventTypes && filter.eventTypes.length > 0 ? filter.eventTypes : null
      })
      .abortSignal(controller.signal) as {
      data: Array<{ h3_cell: string; catches: number; contacts: number; total: number }> | null;
      error: unknown;
    };

    if (error) {
      warnUpload("read", error, "read");
      return null;
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
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- Last good answer, kept on the phone -------------------------------------
//
// STRIKE is offline-first everywhere except here: with no signal the shared map
// was simply empty. Keeping the last answer per view means the tab opens with
// cells already drawn, a dropped request leaves them in place, and an angler on
// a coast with one bar still sees what the map looked like this morning. These
// are the same aggregated, above-threshold cells the server already returns to
// anyone — nothing more private than what is on screen is stored.

const CACHE_PREFIX = "strike.biteMapCache:";

export type CachedBiteMap = { at: string; cells: HexActivity[] };

/** Identifies a view by its filters, not its timestamps: "30d" is one view all day. */
export function biteMapCacheKey(
  mode: string,
  species: string | null | undefined,
  eventTypes: string[] | undefined,
  customSince?: string | null,
  customUntil?: string | null
): string {
  const types = eventTypes && eventTypes.length > 0 ? [...eventTypes].sort().join(",") : "all";
  const range = mode === "custom" ? `${customSince ?? ""}~${customUntil ?? ""}` : mode;
  return `${CACHE_PREFIX}${range}|${species || "all"}|${types}`;
}

export async function readBiteMapCache(key: string): Promise<CachedBiteMap | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedBiteMap>;
    if (typeof parsed.at !== "string" || !Array.isArray(parsed.cells)) return null;
    return { at: parsed.at, cells: parsed.cells };
  } catch {
    return null;
  }
}

export async function writeBiteMapCache(key: string, cells: HexActivity[]): Promise<string> {
  const at = new Date().toISOString();
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ at, cells }));
  } catch {
    // A full disk must not cost the angler the map they are looking at.
  }
  return at;
}
