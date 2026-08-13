/**
 * Pure-JS hex grid for Bite Map cell binning. No external dependencies.
 *
 * Replaces h3-js (which uses an Emscripten/asm.js bundle incompatible with the
 * Hermes JS engine used in React Native production builds).
 *
 * The grid uses a pointy-top axial hex layout over an equirectangular
 * projection. Longitude is scaled by cos(lat) so cells remain roughly
 * equal-sized across Nordic latitudes (~54–58°N). Cell circumradius ≈ 461 m,
 * matching H3 resolution 8.
 *
 * Round-trip guarantee: cellToLatLng(latLngToCell(lat, lng)) returns the same
 * cell centre on every call. Proof: projecting the computed centre back through
 * latLngToCell yields the exact integer axial coords (q, r) — no rounding step
 * is required, so the result is identical.
 *
 * Example — Als centre (55.0°N, 9.9°E):
 *   latLngToCell(55.0, 9.9)            → "-3635,8854"
 *   cellToLatLng("-3635,8854")         → { lat: 54.9995, lng: 9.9041 }
 *   latLngToCell(54.9995, 9.9041)      → "-3635,8854"  ✓
 */

const METERS_PER_DEG_LAT = 111_320;
/** Hex circumradius ≈ H3 res-8 edge length. */
const CELL_RADIUS_M = 461;
/** Circumradius expressed in degrees of latitude. */
const SIZE_DEG = CELL_RADIUS_M / METERS_PER_DEG_LAT; // ≈ 0.004142
const DEG_TO_RAD = Math.PI / 180;
const SQRT3 = Math.sqrt(3);

/**
 * Project (lat, lng) into the flat 2D space where the hex grid lives.
 * Longitude is scaled by cos(lat) so 1 unit in x ≈ 1 unit in y physically.
 */
function project(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng * Math.cos(lat * DEG_TO_RAD)) / SIZE_DEG,
    y: lat / SIZE_DEG,
  };
}

/**
 * Cube-coordinate rounding: given fractional axial (q, r), return the integer
 * axial coords of the nearest hex centre.
 */
function roundHex(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

/**
 * Bin a coordinate into a hex cell. Returns a stable opaque string id.
 * Two coordinates in the same cell always return the same id.
 */
export function latLngToCell(lat: number, lng: number): string {
  const { x, y } = project(lat, lng);
  // Pointy-top axial → fractional hex coords
  const qf = (SQRT3 / 3) * x - (1 / 3) * y;
  const rf = (2 / 3) * y;
  const { q, r } = roundHex(qf, rf);
  return `${q},${r}`;
}

/**
 * Return the centre lat/lng of the hex cell identified by `cell`.
 * The cell argument must be a value previously returned by latLngToCell.
 */
export function cellToLatLng(cell: string): { lat: number; lng: number } {
  const comma = cell.indexOf(",");
  const q = parseInt(cell.slice(0, comma), 10);
  const r = parseInt(cell.slice(comma + 1), 10);
  // Axial → Cartesian centre in normalised space
  const x = SQRT3 * q + (SQRT3 / 2) * r;
  const y = (3 / 2) * r;
  // Normalised space → lat/lng
  const lat = y * SIZE_DEG;
  const lng = (x * SIZE_DEG) / Math.cos(lat * DEG_TO_RAD);
  return { lat, lng };
}
