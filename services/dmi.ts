/**
 * DMI Oceanographic service — water level from Kegnæs fyr (station 06119).
 *
 * Uses the DMI Open Data API v2 (OGC API Features / GeoJSON FeatureCollection).
 * No API key required. All network calls are offline-first: any failure or
 * timeout resolves to null rather than throwing, so this feature can never
 * block the app or other weather data.
 *
 * Results are cached for 15 minutes to respect fair-use on the free API.
 */

const DMI_URL =
  "https://opendataapi.dmi.dk/v2/oceanObs/collections/observation/items";
const STATION_ID = "26457"; // Fynshav Havn I — on Als, has sealev_dvr
const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const TREND_THRESHOLD_CM = 2;
const PHASE_RANGE_THRESHOLD_CM = 4; // minimum range to detect high/low tide

export type WaterLevelTrend = "rising" | "falling" | "stable";
export type TidalPhase = "flooding" | "ebbing" | "highTide" | "lowTide";

export type WaterLevelData = {
  level: number; // cm, relative to DVR90 datum
  trend: WaterLevelTrend;
  phase: TidalPhase;
  timestamp: string; // ISO 8601 of the latest reading
};

// --- Internal types (defensive — DMI API shape may vary) --------------------

// Use unknown internals; validate at runtime.
type DmiCollection = {
  type?: unknown;
  features?: Array<{ properties?: Record<string, unknown> }>;
};

// --- 15-minute module-level cache -------------------------------------------

let _cache: { result: WaterLevelData | null; at: number } | null = null;

// --- Public API -------------------------------------------------------------

/**
 * Returns the latest water level from station 06119 with a trend computed
 * over the preceding hour. Returns null if the API is unreachable or the
 * response is unexpected. Cached for 15 minutes.
 */
export async function getWaterLevel(): Promise<WaterLevelData | null> {
  if (_cache !== null && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.result;
  }
  const result = await fetchWaterLevel();
  _cache = { result, at: Date.now() };
  return result;
}

// --- Private helpers --------------------------------------------------------

function buildUrl(): string {
  const now = new Date();
  const start = new Date(now.getTime() - 6 * 60 * 60 * 1000); // last 6 hours
  const datetime = `${start.toISOString()}/${now.toISOString()}`;
  return (
    `${DMI_URL}?stationId=${STATION_ID}` +
    `&parameterId=sealev_dvr` +
    `&datetime=${encodeURIComponent(datetime)}` +
    `&limit=60`
  );
}

function extractReadings(
  collection: DmiCollection
): { time: number; cm: number }[] {
  if (!Array.isArray(collection.features)) {
    return [];
  }
  const readings: { time: number; cm: number }[] = [];
  for (const feature of collection.features) {
    const props = feature?.properties;
    if (!props) {
      continue;
    }
    const observed = typeof props["observed"] === "string" ? props["observed"] : null;
    const value = typeof props["value"] === "number" ? props["value"] : null;
    if (!observed || value === null) {
      continue;
    }
    const time = new Date(observed).getTime();
    if (!isNaN(time)) {
      readings.push({ time, cm: value });
    }
  }
  return readings;
}

function computePhase(readings: { time: number; cm: number }[], trend: WaterLevelTrend): TidalPhase {
  if (readings.length < 3) {
    return trend === "rising" ? "flooding" : "ebbing";
  }
  const values = readings.map((r) => r.cm);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  if (range < PHASE_RANGE_THRESHOLD_CM) {
    return trend === "rising" ? "flooding" : "ebbing";
  }
  const sorted = [...readings].sort((a, b) => a.time - b.time);
  const latest = sorted[sorted.length - 1];
  const normalised = (latest.cm - min) / range;
  if (normalised >= 0.85) return "highTide";
  if (normalised <= 0.15) return "lowTide";
  return trend === "rising" ? "flooding" : "ebbing";
}

function computeTrend(readings: { time: number; cm: number }[]): WaterLevelTrend {
  if (readings.length < 2) {
    return "stable";
  }
  const sorted = [...readings].sort((a, b) => a.time - b.time);
  const latest = sorted[sorted.length - 1];
  const oneHourAgo = latest.time - 60 * 60 * 1000;

  // Find the reading closest to one hour before the latest.
  let past = sorted[0];
  let minDist = Math.abs(sorted[0].time - oneHourAgo);
  for (const r of sorted) {
    const dist = Math.abs(r.time - oneHourAgo);
    if (dist < minDist) {
      minDist = dist;
      past = r;
    }
  }

  const delta = latest.cm - past.cm;
  if (delta > TREND_THRESHOLD_CM) return "rising";
  if (delta < -TREND_THRESHOLD_CM) return "falling";
  return "stable";
}

async function fetchWaterLevel(): Promise<WaterLevelData | null> {
  const url = buildUrl();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const data = JSON.parse(text) as DmiCollection;
    if (data?.type !== "FeatureCollection") {
      return null;
    }

    const readings = extractReadings(data);
    if (readings.length === 0) {
      return null;
    }

    const sorted = [...readings].sort((a, b) => b.time - a.time);
    const latest = sorted[0];

    const trend = computeTrend(readings);
    return {
      level: Math.round(latest.cm),
      trend,
      phase: computePhase(readings, trend),
      timestamp: new Date(latest.time).toISOString()
    };
  } catch {
    // Offline / timeout / unexpected shape — water level is optional.
    return null;
  }
}
