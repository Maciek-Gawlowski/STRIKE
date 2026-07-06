import type { ZoneActivity } from "./biteMap";
import { ZONES } from "./zones";

// TODO: remove fallback after alpha.
/**
 * Static placeholder activity, keyed to the real zones, used only when
 * getBiteMapData() comes back empty (e.g. Supabase unreachable or not yet
 * seeded) so the hotspot sheet always has something to show during alpha
 * testing.
 */
export const MOCK_BITE_MAP_ACTIVITY: ZoneActivity[] = ZONES.map((zone, index) => {
  const pattern = [9, 2, 5, 0, 7, 1, 4, 0, 3];
  const total = pattern[index % pattern.length];
  const catches = Math.round(total * 0.6);
  return {
    zone_id: zone.id,
    zone_name: zone.name,
    catches,
    contacts: total - catches,
    total
  };
});

export type MockHeatPoint = {
  id: number;
  latitude: number;
  longitude: number;
  /** Normalised activity, 0..1 */
  value: number;
};

// TODO: remove fallback after alpha.
/**
 * Raw lat/lng activity smudges spread along the Als coastline, independent of
 * the 9 selectable zones above. Used only to paint the heatmap overlay when
 * there's no real data — overlapping low/medium points blend into the
 * high-activity clusters to give the smooth multi-color falloff look.
 */
export const MOCK_HEAT_POINTS: MockHeatPoint[] = [
  // Nordkysten
  { id: 1, latitude: 55.1, longitude: 9.87, value: 0.2 },
  { id: 2, latitude: 55.11, longitude: 9.92, value: 0.55 },
  { id: 3, latitude: 55.09, longitude: 9.97, value: 0.18 },
  { id: 4, latitude: 55.12, longitude: 10.02, value: 0.28 },
  { id: 5, latitude: 55.08, longitude: 10.06, value: 0.15 },
  { id: 6, latitude: 55.1, longitude: 10.09, value: 0.22 },
  { id: 7, latitude: 55.095, longitude: 9.89, value: 0.6 },
  { id: 8, latitude: 55.085, longitude: 9.94, value: 0.12 },
  { id: 9, latitude: 55.105, longitude: 9.99, value: 0.3 },
  { id: 10, latitude: 55.078, longitude: 10.04, value: 0.85 },

  // Sydkysten
  { id: 11, latitude: 54.9, longitude: 9.87, value: 0.62 },
  { id: 12, latitude: 54.93, longitude: 9.92, value: 0.45 },
  { id: 13, latitude: 54.89, longitude: 9.96, value: 0.2 },
  { id: 14, latitude: 54.94, longitude: 10.0, value: 0.16 },
  { id: 15, latitude: 54.91, longitude: 10.04, value: 0.25 },
  { id: 16, latitude: 54.95, longitude: 9.89, value: 0.18 },
  { id: 17, latitude: 54.885, longitude: 9.99, value: 0.3 },
  { id: 18, latitude: 54.92, longitude: 9.86, value: 0.14 },

  // Sønderborg Bugt — high-activity cluster
  { id: 19, latitude: 54.91, longitude: 9.79, value: 1.0 },
  { id: 20, latitude: 54.913, longitude: 9.795, value: 0.92 },
  { id: 21, latitude: 54.907, longitude: 9.785, value: 0.8 },
  { id: 22, latitude: 54.915, longitude: 9.8, value: 0.55 },
  { id: 23, latitude: 54.905, longitude: 9.778, value: 0.5 },
  { id: 24, latitude: 54.92, longitude: 9.805, value: 0.4 },

  // Ærøsund area
  { id: 25, latitude: 54.88, longitude: 9.88, value: 0.48 },

  // Scattered low activity around the rest of the coastline
  { id: 26, latitude: 55.0, longitude: 9.75, value: 0.2 },
  { id: 27, latitude: 55.02, longitude: 10.08, value: 0.15 },
  { id: 28, latitude: 54.96, longitude: 9.78, value: 0.22 },
  { id: 29, latitude: 54.86, longitude: 9.93, value: 0.18 },
  { id: 30, latitude: 55.06, longitude: 9.8, value: 0.25 }
];
