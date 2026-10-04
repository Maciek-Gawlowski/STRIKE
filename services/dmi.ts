import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Coordinate } from "@/store/useStrikeStore";

/**
 * DMI Oceanographic service — water level from the nearest measuring station.
 *
 * This used to read a single hardcoded station (Fynshav Havn, on Als). For an
 * angler anywhere else in Denmark that number was not merely imprecise, it was
 * a different body of water: someone fishing in Copenhagen saw the tide at
 * Fynshav, 250 km away, and — worse — that figure was written into the weather
 * snapshot attached to every catch, so their water-level statistics described
 * a coastline they had never fished.
 *
 * The station list is fetched from DMI rather than bundled. DMI adds and
 * retires stations, and a stale list would reintroduce the same class of bug
 * quietly. It is cached for 30 days, so this costs one request a month.
 *
 * Privacy: no position is ever sent to DMI. The app downloads the public list
 * of stations and picks the nearest one on the phone. DMI sees a request for a
 * station id, which tells it nothing about who asked or where they are.
 *
 * Everything here is offline-first: any failure resolves to null rather than
 * throwing, so water level can never block the app.
 */

const DMI_BASE = "https://opendataapi.dmi.dk/v2/oceanObs/collections";
const OBS_URL = `${DMI_BASE}/observation/items`;
const STATION_URL = `${DMI_BASE}/station/items`;

/** The parameter carrying sea level relative to the DVR90 datum. */
const SEA_LEVEL_PARAM = "sealev_dvr";

const TIMEOUT_MS = 4000;
const READING_CACHE_TTL_MS = 15 * 60 * 1000;
const STATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STATION_CACHE_KEY = "strike.dmiStations";

/**
 * Beyond this, the nearest station is not describing the water you are
 * standing in. Better to show nothing than a confident wrong number — which
 * is the mistake this file exists to undo.
 */
const MAX_STATION_DISTANCE_KM = 120;

/** Stations can be retired without notice, so fall through to the next one. */
const STATIONS_TO_TRY = 3;

const TREND_THRESHOLD_CM = 2;
const PHASE_RANGE_THRESHOLD_CM = 4;

export type WaterLevelTrend = "rising" | "falling" | "stable";
export type TidalPhase = "flooding" | "ebbing" | "highTide" | "lowTide";

export type WaterLevelData = {
  level: number; // cm, relative to DVR90
  trend: WaterLevelTrend;
  phase: TidalPhase;
  timestamp: string;
  /** Which station this reading came from — shown to the user, not decoration. */
  stationName: string;
  stationId: string;
  /** How far that station is from the reading position, in km. */
  distanceKm: number;
};

type Station = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type DmiCollection = {
  type?: unknown;
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: unknown };
  }>;
};

// --- Caches -----------------------------------------------------------------

let _stations: Station[] | null = null;
let _readingCache: { key: string; result: WaterLevelData | null; at: number } | null = null;
/** The last station that actually answered, for launches before a GPS fix. */
let _lastGoodStation: Station | null = null;

// --- Public API -------------------------------------------------------------

/**
 * Latest water level near `position`, with a trend computed over the preceding
 * hour. Returns null when offline, when no station is close enough, or when
 * the response is not what we expect.
 *
 * With no position it reuses the station that last answered — the app is
 * often opened indoors before the first fix lands, and the angler's usual
 * coast is a better guess than a station 250 km away.
 */
export async function getWaterLevel(position?: Coordinate | null): Promise<WaterLevelData | null> {
  const candidates = await resolveStations(position);
  if (candidates.length === 0) {
    return null;
  }

  const key = candidates[0].station.id;
  if (_readingCache !== null && _readingCache.key === key && Date.now() - _readingCache.at < READING_CACHE_TTL_MS) {
    return _readingCache.result;
  }

  let result: WaterLevelData | null = null;
  for (const candidate of candidates) {
    result = await fetchWaterLevel(candidate.station, candidate.distanceKm);
    if (result) {
      _lastGoodStation = candidate.station;
      break;
    }
  }

  _readingCache = { key, result, at: Date.now() };
  return result;
}

// --- Station resolution -----------------------------------------------------

async function resolveStations(
  position?: Coordinate | null
): Promise<{ station: Station; distanceKm: number }[]> {
  const stations = await loadStations();

  if (!position) {
    return _lastGoodStation ? [{ station: _lastGoodStation, distanceKm: 0 }] : [];
  }
  if (stations.length === 0) {
    return [];
  }

  return stations
    .map((station) => ({
      station,
      distanceKm: distanceKm(position.latitude, position.longitude, station.latitude, station.longitude)
    }))
    .filter((entry) => entry.distanceKm <= MAX_STATION_DISTANCE_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, STATIONS_TO_TRY);
}

async function loadStations(): Promise<Station[]> {
  if (_stations) {
    return _stations;
  }

  try {
    const raw = await AsyncStorage.getItem(STATION_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { at?: number; stations?: Station[] };
      if (
        Array.isArray(cached.stations) &&
        cached.stations.length > 0 &&
        typeof cached.at === "number" &&
        Date.now() - cached.at < STATION_CACHE_TTL_MS
      ) {
        _stations = cached.stations;
        return _stations;
      }
      // Stale, but keep it as a fallback if the refresh below fails offline.
      if (Array.isArray(cached.stations) && cached.stations.length > 0) {
        _stations = cached.stations;
      }
    }
  } catch {
    // Unreadable cache is not worth reporting; we are about to refetch.
  }

  const fetched = await fetchStations();
  if (fetched.length > 0) {
    _stations = fetched;
    try {
      await AsyncStorage.setItem(
        STATION_CACHE_KEY,
        JSON.stringify({ at: Date.now(), stations: fetched })
      );
    } catch {
      // Cache write failure just means we fetch again next launch.
    }
  }

  return _stations ?? [];
}

async function fetchStations(): Promise<Station[]> {
  const data = await fetchCollection(`${STATION_URL}?limit=1000`);
  if (!data) {
    return [];
  }

  const stations: Station[] = [];
  for (const feature of data.features ?? []) {
    const props = feature?.properties;
    if (!props) continue;

    // Only stations that actually report sea level are of any use here.
    const parameters = props["parameterId"];
    const reportsSeaLevel = Array.isArray(parameters)
      ? parameters.some((p) => p === SEA_LEVEL_PARAM)
      : parameters === SEA_LEVEL_PARAM;
    if (!reportsSeaLevel) continue;

    const id = typeof props["stationId"] === "string" ? props["stationId"] : null;
    const name = typeof props["name"] === "string" ? props["name"] : null;
    const coords = feature?.geometry?.coordinates;
    if (!id || !name || !Array.isArray(coords) || coords.length < 2) continue;

    // GeoJSON is [longitude, latitude] — the opposite order to everywhere else
    // in this codebase, and an easy way to end up with a station in the sea
    // off Somalia.
    const longitude = Number(coords[0]);
    const latitude = Number(coords[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    stations.push({ id, name, latitude, longitude });
  }
  return stations;
}

// --- Readings ---------------------------------------------------------------

function buildObservationUrl(stationId: string): string {
  const now = new Date();
  const start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const datetime = `${start.toISOString()}/${now.toISOString()}`;
  return (
    `${OBS_URL}?stationId=${encodeURIComponent(stationId)}` +
    `&parameterId=${SEA_LEVEL_PARAM}` +
    `&datetime=${encodeURIComponent(datetime)}` +
    `&limit=60`
  );
}

async function fetchWaterLevel(station: Station, distance: number): Promise<WaterLevelData | null> {
  const data = await fetchCollection(buildObservationUrl(station.id));
  if (!data) {
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
    timestamp: new Date(latest.time).toISOString(),
    stationName: station.name,
    stationId: station.id,
    distanceKm: Math.round(distance)
  };
}

async function fetchCollection(url: string): Promise<DmiCollection | null> {
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
    const data = JSON.parse(await response.text()) as DmiCollection;
    return data?.type === "FeatureCollection" ? data : null;
  } catch {
    return null;
  }
}

function extractReadings(collection: DmiCollection): { time: number; cm: number }[] {
  if (!Array.isArray(collection.features)) {
    return [];
  }
  const readings: { time: number; cm: number }[] = [];
  for (const feature of collection.features) {
    const props = feature?.properties;
    if (!props) continue;
    const observed = typeof props["observed"] === "string" ? props["observed"] : null;
    const value = typeof props["value"] === "number" ? props["value"] : null;
    if (!observed || value === null) continue;
    const time = new Date(observed).getTime();
    if (!isNaN(time)) {
      readings.push({ time, cm: value });
    }
  }
  return readings;
}

// --- Maths ------------------------------------------------------------------

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
