/**
 * Danish fredningsbælter — the zones where fishing is restricted around
 * stream mouths, from Fiskeristyrelsen's own published map data.
 *
 * ALL 604 zones are loaded and drawn at once, with no filtering by position
 * or by what is on screen. That is not laziness, it is the only shape of this
 * feature that does not crash.
 *
 * Two earlier versions filtered the set — first by map region, then by a
 * radius around the angler snapped to a grid, with a debounce. Both drew the
 * right shapes and both killed the app natively within seconds of panning.
 * react-native-maps does not survive overlays being mounted and unmounted
 * under a live map; build 47 died of the same thing. A set that never changes
 * has nothing to mount or unmount, so the whole failure mode disappears.
 *
 * The price is paid in geometry instead: the bundled file is simplified to
 * about 13,000 points so 604 polygons can sit on the map at once. Boundaries
 * can be off by up to ~37 m, which is invisible when drawn and irrelevant for
 * a proximity warning that will need a safety margin of its own anyway.
 *
 * Three more things govern how this file behaves.
 *
 * It never says "you may fish here". It says where a zone is, when that zone
 * applies, and which order defines it. The user decides. That distinction is
 * the whole reason this is shippable: a wrong "you're fine" costs someone a
 * fine, a wrong "check this" costs them ten seconds.
 *
 * The source data's period field is free text typed by hand — "Hele året",
 * "Helårlig fredning" and "Helårlig" are one rule spelled three ways, and 45
 * zones say only "Halvårlig" without saying which half. The build script
 * (scripts/buildProtectionZones.py) resolves that against the coded PeriodeTyp
 * field and writes a clean `period` here, so nothing downstream parses Danish.
 *
 * 32 zones resolve to "unknown" — mostly "Særfredning", which points at an
 * order rather than stating dates. Those are treated as ACTIVE all year. It is
 * the wrong answer for whichever of them is seasonal, but it is wrong in the
 * direction that cannot get anyone fined.
 */

export type ZonePeriod = "year" | "season" | "unknown";

export type ProtectionZone = {
  id: string;
  name: string;
  /** Resolved rule. "unknown" means the order has to be read. */
  period: ZonePeriod;
  /** The source's own wording, shown as-is so we never put words in the law's mouth. */
  periodText: string;
  /** e.g. "Bekg. nr. 769 af 9. juli 2004, § 2 stk. 1-2" */
  law: string;
  /** Retsinformation link to the order itself. */
  url?: string;
  /** "MM-DD", season zones only. May wrap the new year (09-16 → 03-15). */
  from?: string;
  to?: string;
  /** [west, south, east, north] — precomputed so filtering never walks the rings. */
  bbox: [number, number, number, number];
  /**
   * One entry per polygon. `holes` are cut-outs where the rule does NOT
   * apply — three zones have them, and treating a hole as part of the zone
   * would warn someone standing in a spot that is explicitly excluded.
   */
  polygons: { outer: number[][]; holes: number[][][] }[];
};

type RawFeature = {
  properties: Omit<ProtectionZone, "bbox" | "polygons">;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};

let cache: ProtectionZone[] | null = null;

/**
 * Loads and indexes the zone file.
 *
 * The require is deliberately inside the function. The file is ~1 MB of JSON
 * and most sessions never open a map; paying for it at module load would
 * slow every cold start for a feature used on some trips.
 */
export function loadZones(): ProtectionZone[] {
  if (cache) return cache;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("@/data/protectionZones.json") as { features: RawFeature[] };

  cache = raw.features.map((f) => {
    // GeoJSON nests one level deeper for MultiPolygon. Within each polygon the
    // first ring is the outline and the rest are holes.
    const polygonList: number[][][][] =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as number[][][]]
        : (f.geometry.coordinates as number[][][][]);

    const polygons = polygonList.map((rings) => ({ outer: rings[0], holes: rings.slice(1) }));

    let west = 180, south = 90, east = -180, north = -90;
    for (const { outer } of polygons) {
      for (const [lng, lat] of outer) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }

    return { ...f.properties, bbox: [west, south, east, north] as [number, number, number, number], polygons };
  });

  return cache;
}

/** "MM-DD" for a date, in the device's own timezone — the one the angler is standing in. */
function monthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Is this zone closed on the given date?
 *
 * Season ranges wrap the new year (16 Sept → 15 March), so a plain `>= from &&
 * <= to` comparison would report every winter zone as open all winter, which
 * is exactly backwards.
 */
export function isZoneActive(zone: ProtectionZone, date: Date = new Date()): boolean {
  if (zone.period === "year" || zone.period === "unknown") return true;
  if (!zone.from || !zone.to) return true;

  const today = monthDay(date);
  return zone.from <= zone.to
    ? today >= zone.from && today <= zone.to
    : today >= zone.from || today <= zone.to;
}

/** Ray casting against one ring. Points exactly on an edge are not worth special-casing at GPS precision. */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Which zones contain this position, counting only ones closed today.
 *
 * Returns an array because zones do overlap in a few estuaries. The bbox test
 * runs first so the ray casting only ever sees a handful of candidates — this
 * is cheap enough to run on every GPS update during a trip.
 */
export function zonesAtPosition(
  latitude: number,
  longitude: number,
  date: Date = new Date(),
  zones: ProtectionZone[] = loadZones()
): ProtectionZone[] {
  const hits: ProtectionZone[] = [];

  for (const zone of zones) {
    const [west, south, east, north] = zone.bbox;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    if (!isZoneActive(zone, date)) continue;
    // Inside the outline and not inside any of its cut-outs.
    const inside = zone.polygons.some(
      ({ outer, holes }) =>
        pointInRing(longitude, latitude, outer) &&
        !holes.some((hole) => pointInRing(longitude, latitude, hole))
    );
    if (inside) hits.push(zone);
  }

  return hits;
}
