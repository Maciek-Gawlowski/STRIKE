import { getBiteMapContribution } from "@/database/preferences";
import type { StrikeEvent } from "@/store/useStrikeStore";
import { supabase } from "./supabase";
import { degreesToCompass, type WeatherData } from "./weather";
import { ZONES, zoneName } from "./zones";

/**
 * Bite Map backend access.
 *
 * Contribution model (area-level only): when the user is opted in, every event
 * uploads zone_id + coarse context (event type, hour, date, wind, water temp).
 * Exact GPS (lat/lng) is NEVER sent to the community. No user identifier is ever
 * sent. Everything is fire-and-forget and fails silently offline.
 */

export type ZoneActivity = {
  zone_id: number;
  zone_name: string;
  catches: number;
  contacts: number;
  total: number;
};

export type BiteMapHours = 2 | 24 | 168;

/**
 * Uploads a single anonymous area-level activity event for a zone. No-ops
 * (silently) when offline, not opted in, or Supabase is not configured. Exact
 * coordinates are never sent.
 */
export async function uploadBiteMapEvent(
  event: StrikeEvent,
  zoneId: number,
  weather: WeatherData | null
): Promise<void> {
  try {
    if (!supabase) {
      return;
    }
    // Opt-in gate (the master switch in privacy settings).
    if (!(await getBiteMapContribution())) {
      return;
    }

    const timestamp = new Date(event.timestamp);
    await supabase.from("bite_map_events").insert({
      zone_id: zoneId,
      event_type: event.type,
      hour_of_day: timestamp.getHours(),
      date: timestamp.toISOString().slice(0, 10),
      wind_direction: weather ? degreesToCompass(weather.windDirection) : null,
      water_temp: weather?.waterTemp ?? null
    });
  } catch {
    // Offline / network / RLS error — Bite Map is best-effort, never throw.
  }
}

function emptyActivity(): ZoneActivity[] {
  return ZONES.map((zone) => ({
    zone_id: zone.id,
    zone_name: zone.name,
    catches: 0,
    contacts: 0,
    total: 0
  }));
}

/**
 * Fetches aggregated activity per zone for the last `hours` window. Always
 * returns all 9 zones (zeroed when there is no data or we are offline), so the
 * map always renders.
 */
export async function getBiteMapData(hours: BiteMapHours): Promise<ZoneActivity[]> {
  const zones = emptyActivity();
  const byId = new Map(zones.map((zone) => [zone.zone_id, zone]));

  try {
    if (!supabase) {
      return zones;
    }
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("bite_map_events")
      .select("zone_id,event_type")
      .gte("created_at", since);

    if (error || !data) {
      return zones;
    }

    for (const row of data) {
      const zone = byId.get(row.zone_id);
      if (!zone) {
        continue;
      }
      if (row.event_type === "catch") {
        zone.catches += 1;
      } else if (row.event_type === "contact") {
        zone.contacts += 1;
      }
      zone.total += 1;
    }
    return zones;
  } catch {
    return zones;
  }
}

export { zoneName };
