import { cellToLatLng, latLngToCell } from "@/services/hexGrid";
import type { HexActivity } from "./biteMap";

// DEMO DATA — remove before real aggregation

/**
 * Placeholder activity spread around the Als coastline, expressed as real H3
 * cells. Used only when getBiteMapData() returns empty (Supabase unreachable or
 * not yet seeded with h3_cell data).
 */
const MOCK_POINTS: { lat: number; lng: number; total: number }[] = [
  // ── Hotspot 1 — Sønderborg Bugt (HOT) ──────────────────────────────────────
  { lat: 54.910, lng: 9.790, total: 23 },
  { lat: 54.905, lng: 9.800, total: 8 },
  { lat: 54.915, lng: 9.795, total: 3 },
  // ── Hotspot 2 — Nordals tip ─────────────────────────────────────────────────
  { lat: 55.094, lng: 9.892, total: 18 },
  { lat: 55.095, lng: 9.889, total: 6 },
  { lat: 55.100, lng: 9.900, total: 4 },
  // ── Hotspot 3 — Ærøsund channel ─────────────────────────────────────────────
  { lat: 54.882, lng: 9.882, total: 15 },
  { lat: 54.885, lng: 9.875, total: 4 },
  // ── Hotspot 4 — East Nordals ─────────────────────────────────────────────────
  { lat: 55.080, lng: 10.040, total: 12 },
  { lat: 55.085, lng: 10.045, total: 3 },
  // ── Hotspot 5 — Sydals mid ───────────────────────────────────────────────────
  { lat: 54.940, lng: 9.920, total: 9 },
  { lat: 54.950, lng: 9.930, total: 2 },
  // ── Hotspot 6 — Northwest Als ────────────────────────────────────────────────
  { lat: 55.060, lng: 9.800, total: 7 },
  { lat: 55.070, lng: 9.820, total: 3 },
  // ── Hotspot 7 — Sydals west ──────────────────────────────────────────────────
  { lat: 54.960, lng: 9.870, total: 5 },
  { lat: 54.930, lng: 9.870, total: 2 },
  // ── Hotspot 8 — Northeast ────────────────────────────────────────────────────
  { lat: 55.030, lng: 10.050, total: 4 },
  // ── Medium / scattered ───────────────────────────────────────────────────────
  { lat: 54.970, lng: 9.880, total: 1 },
  { lat: 55.015, lng: 9.940, total: 2 },
  { lat: 54.865, lng: 9.900, total: 1 },
];

export const MOCK_BITE_MAP_ACTIVITY: HexActivity[] = MOCK_POINTS
  .filter((p) => p.total > 0)
  .map(({ lat, lng, total }) => {
    const h3_cell = latLngToCell(lat, lng);
    const { lat: cellLat, lng: cellLng } = cellToLatLng(h3_cell);
    const catches = Math.round(total * 0.6);
    return { h3_cell, lat: cellLat, lng: cellLng, catches, contacts: total - catches, total };
  });

export type MockHeatPoint = {
  id: number;
  latitude: number;
  longitude: number;
  /** Normalised activity, 0..1 */
  value: number;
};

/**
 * Raw lat/lng smudges for the heatmap overlay — independent of hex cells, used
 * only to paint the visual gradient when there's no real data.
 * DEMO DATA — ~185 points, clustered along Als coastline.
 */
// 44 points — one per cluster zone, kept sparse so the reprojection stays fast
// and the coastline stays readable through the faint glow.
export const MOCK_HEAT_POINTS: MockHeatPoint[] = [
  // Sønderborg Bugt (HOT)
  { id: 1,  latitude: 54.910, longitude: 9.790, value: 1.00 },
  { id: 2,  latitude: 54.912, longitude: 9.793, value: 0.90 },
  { id: 3,  latitude: 54.907, longitude: 9.786, value: 0.88 },
  { id: 4,  latitude: 54.915, longitude: 9.798, value: 0.80 },
  { id: 5,  latitude: 54.905, longitude: 9.800, value: 0.75 },
  { id: 6,  latitude: 54.918, longitude: 9.783, value: 0.70 },
  { id: 7,  latitude: 54.902, longitude: 9.796, value: 0.65 },
  { id: 8,  latitude: 54.920, longitude: 9.792, value: 0.55 },
  { id: 9,  latitude: 54.898, longitude: 9.780, value: 0.48 },
  { id: 10, latitude: 54.924, longitude: 9.802, value: 0.38 },
  // Nordals tip
  { id: 11, latitude: 55.094, longitude: 9.892, value: 0.88 },
  { id: 12, latitude: 55.096, longitude: 9.896, value: 0.80 },
  { id: 13, latitude: 55.090, longitude: 9.887, value: 0.75 },
  { id: 14, latitude: 55.100, longitude: 9.900, value: 0.65 },
  { id: 15, latitude: 55.086, longitude: 9.878, value: 0.58 },
  { id: 16, latitude: 55.104, longitude: 9.912, value: 0.48 },
  { id: 17, latitude: 55.082, longitude: 9.902, value: 0.40 },
  { id: 18, latitude: 55.110, longitude: 9.888, value: 0.32 },
  // Ærøsund channel
  { id: 19, latitude: 54.882, longitude: 9.882, value: 0.78 },
  { id: 20, latitude: 54.885, longitude: 9.887, value: 0.70 },
  { id: 21, latitude: 54.878, longitude: 9.876, value: 0.65 },
  { id: 22, latitude: 54.888, longitude: 9.892, value: 0.55 },
  { id: 23, latitude: 54.874, longitude: 9.868, value: 0.45 },
  { id: 24, latitude: 54.892, longitude: 9.900, value: 0.36 },
  // East Nordals
  { id: 25, latitude: 55.080, longitude: 10.040, value: 0.65 },
  { id: 26, latitude: 55.083, longitude: 10.045, value: 0.58 },
  { id: 27, latitude: 55.077, longitude: 10.034, value: 0.52 },
  { id: 28, latitude: 55.086, longitude: 10.052, value: 0.44 },
  { id: 29, latitude: 55.073, longitude: 10.026, value: 0.36 },
  { id: 30, latitude: 55.089, longitude: 10.060, value: 0.28 },
  // Sydals coast (medium)
  { id: 31, latitude: 54.940, longitude: 9.920, value: 0.45 },
  { id: 32, latitude: 54.925, longitude: 9.935, value: 0.38 },
  { id: 33, latitude: 54.952, longitude: 9.910, value: 0.34 },
  { id: 34, latitude: 54.965, longitude: 9.948, value: 0.28 },
  { id: 35, latitude: 54.935, longitude: 9.870, value: 0.30 },
  { id: 36, latitude: 54.955, longitude: 9.862, value: 0.22 },
  // Scattered low
  { id: 37, latitude: 55.060, longitude: 9.802, value: 0.22 },
  { id: 38, latitude: 55.015, longitude: 9.750, value: 0.16 },
  { id: 39, latitude: 55.030, longitude: 10.055, value: 0.18 },
  { id: 40, latitude: 54.870, longitude: 9.978, value: 0.15 },
  { id: 41, latitude: 55.000, longitude: 9.880, value: 0.16 },
  { id: 42, latitude: 54.980, longitude: 9.820, value: 0.14 },
  { id: 43, latitude: 55.112, longitude: 9.952, value: 0.14 },
  { id: 44, latitude: 54.858, longitude: 9.940, value: 0.12 },
];
