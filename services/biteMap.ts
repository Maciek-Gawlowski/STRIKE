import { cellToLatLng } from "@/services/hexGrid";
import type { StrikeEvent } from "@/store/useStrikeStore";
import { supabase } from "./supabase";
import { degreesToCompass, type WeatherData } from "./weather";
import type { SQLiteDatabase } from "expo-sqlite";
import { getBiteMapDeleteQueue, clearBiteMapDeleteQueue, type WeatherSnapshot } from "@/database/queries";

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
 * Server-side aggregation RPC (optional, replaces the client-side loop):
 *   SELECT h3_cell, event_type, COUNT(*) AS n
 *   FROM bite_map_events
 *   WHERE created_at >= $since AND h3_cell IS NOT NULL
 *   GROUP BY h3_cell, event_type;
 *
 * Until the RPC exists, aggregation runs client-side on the raw rows.
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
  } catch {
    // Offline / network / RLS error — Bite Map is best-effort, never throw.
  }
}

/**
 * Deletes Bite Map rows by local_event_id. Throws on network failure so the
 * caller can queue the ids for retry via queueBiteMapDelete.
 */
export async function deleteBiteMapEvents(eventIds: string[]): Promise<void> {
  if (!supabase || eventIds.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("bite_map_events") as any)
    .delete()
    .in("local_event_id", eventIds);
  if (error) throw error;
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
  } catch {
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
  } catch {
    // offline — proceed to re-insert anyway (may create a duplicate, acceptable)
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
  } catch {
    // best-effort
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from("bite_map_events") as any)
      .select("h3_cell,event_type,species")
      .gte("created_at", filter.since)
      .not("h3_cell", "is", null);
    if (filter.until) {
      query = query.lte("created_at", filter.until);
    }

    const { data, error } = await query as {
      data: Array<{ h3_cell: string | null; event_type: string; species: string | null }> | null;
      error: unknown;
    };

    if (error || !data || data.length === 0) return [];

    // Client-side filter + aggregation.
    const cellMap = new Map<string, { catches: number; contacts: number; total: number }>();
    for (const row of data) {
      if (!row.h3_cell) continue;
      // Species filter: if set, only include catch rows matching that species
      if (filter.species && row.event_type === "catch" && row.species !== filter.species) continue;
      // If species filter is set, skip non-catch event types (no species to match on)
      if (filter.species && row.event_type !== "catch") continue;
      // Event type filter: if set, skip rows not in the list
      if (filter.eventTypes && filter.eventTypes.length > 0 && !filter.eventTypes.includes(row.event_type)) continue;
      const entry = cellMap.get(row.h3_cell) ?? { catches: 0, contacts: 0, total: 0 };
      if (row.event_type === "catch") entry.catches += 1;
      else if (row.event_type === "contact") entry.contacts += 1;
      entry.total += 1;
      cellMap.set(row.h3_cell, entry);
    }

    return Array.from(cellMap.entries()).map(([cell, counts]) => {
      const { lat, lng } = cellToLatLng(cell);
      return { h3_cell: cell, lat, lng, ...counts };
    });
  } catch {
    return [];
  }
}
