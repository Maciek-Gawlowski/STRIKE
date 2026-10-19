import * as Network from "expo-network";
import { enqueueWrite, getDb } from "@/database/db";
import {
  getEventsMissingWeather,
  insertWeatherSnapshot,
  type WeatherSnapshot
} from "@/database/queries";

/**
 * Weather service backed by Open-Meteo (free, no API key).
 *
 * Everything here is offline-first: any network failure resolves to `null`
 * rather than throwing, so weather is always an enhancement and never blocks
 * the UI or the data layer.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const REQUEST_TIMEOUT_MS = 8000;

export type WeatherData = {
  airTemp: number; // °C
  windSpeed: number; // m/s
  windDirection: number; // degrees (0-360)
  pressure: number; // hPa, surface
  waterTemp: number | null; // °C, null for inland / unavailable

  /**
   * Everything below is optional and costs nothing extra: Open-Meteo returns it
   * in the same two requests, as a longer comma-separated variable list. We ask
   * for far more than the app currently displays on purpose. A condition we
   * never requested has to be rebuilt later from a coarser archive; a condition
   * we stored and ignored is free to start showing the day we decide to.
   */
  apparentTemp?: number;      // °C, "feels like"
  humidity?: number;          // %
  pressureMsl?: number;       // hPa at mean sea level — the one anglers quote
  windGust?: number;          // m/s
  cloudCover?: number;        // %
  precipitation?: number;     // mm in the preceding hour
  weatherCode?: number;       // WMO code
  isDay?: number;             // 1 day, 0 night

  waveHeight?: number;        // m
  waveDirection?: number;     // degrees
  wavePeriod?: number;        // s
  currentVelocity?: number;   // km/h
  currentDirection?: number;  // degrees
  seaLevelMsl?: number;       // m above global mean sea level
};

// --- Formatting helpers -----------------------------------------------------

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
] as const;

/** Converts a wind bearing in degrees to a 16-point compass label (e.g. "NW"). */
export function degreesToCompass(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_16[index];
}

/**
 * Wind direction as it is stored on a snapshot, rendered as a compass label.
 *
 * The column has carried two different things over the app's life: early rows
 * kept the raw bearing as a string, later ones the compass label itself. Code
 * that assumed one or the other was wrong half the time — feeding "NW" to a
 * function expecting degrees is what put "undefined 4 m/s" on the catch screen,
 * and the reverse put a null wind direction on the shared map. Deciding from
 * the value rather than from an assumption is correct for both vintages.
 */
export function windLabel(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const degrees = Number(stored);
  return Number.isFinite(degrees) ? degreesToCompass(degrees) : stored;
}

/** Human-readable wind summary, e.g. "NW 7 m/s". */
export function formatWind(data: WeatherData): string {
  return `${degreesToCompass(data.windDirection)} ${Math.round(data.windSpeed)} m/s`;
}

// --- Low-level fetch --------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  // Manual timeout so poor coverage fails fast instead of hanging the request.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

type ForecastResponse = {
  current?: {
    temperature_2m?: number | null;
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
    surface_pressure?: number | null;
    apparent_temperature?: number | null;
    relative_humidity_2m?: number | null;
    pressure_msl?: number | null;
    wind_gusts_10m?: number | null;
    cloud_cover?: number | null;
    precipitation?: number | null;
    weather_code?: number | null;
    is_day?: number | null;
  };
};

type MarineResponse = {
  current?: {
    sea_surface_temperature?: number | null;
    wave_height?: number | null;
    wave_direction?: number | null;
    wave_period?: number | null;
    ocean_current_velocity?: number | null;
    ocean_current_direction?: number | null;
    sea_level_height_msl?: number | null;
  };
};

/** Narrows an Open-Meteo field to a number, treating null/absent as missing. */
function num(value: number | null | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function buildUrl(base: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${base}?${query}`;
}

/**
 * Coordinates sent to Open-Meteo are truncated before they leave the device.
 * STRIKE's promise is that a user's exact spot is never handed to anyone, and
 * that has to hold for third-party APIs too — not just for our own backend.
 *
 * 3 decimals ≈ 110 m, far finer than Open-Meteo's own grid (~1–11 km), so the
 * returned conditions are identical while the request no longer pinpoints where
 * someone is standing. Not rounded any coarser, because the marine grid needs
 * the point to stay on the water side of the shoreline.
 */
const COORD_PRECISION = 3;
const coarse = (value: number): string => value.toFixed(COORD_PRECISION);

const MARINE_FULL =
  "sea_surface_temperature,wave_height,wave_direction,wave_period," +
  "ocean_current_velocity,ocean_current_direction,sea_level_height_msl";

/**
 * Marine conditions. Optional throughout: inland coordinates and API errors
 * both resolve to an empty object rather than throwing.
 *
 * The request is made twice over if it has to be. Open-Meteo rejects the whole
 * call with a 400 if a single variable is unsupported for the chosen model, and
 * water temperature is the one field the app already relies on — losing it
 * because we also asked for wave period would be a bad trade. So the wide
 * request is attempted first and a failure falls back to the narrow one.
 */
async function fetchMarine(lat: number, lng: number): Promise<MarineResponse["current"]> {
  const request = (variables: string) =>
    fetchJson<MarineResponse>(
      buildUrl(MARINE_URL, {
        latitude: coarse(lat),
        longitude: coarse(lng),
        current: variables
      })
    );

  try {
    const data = await request(MARINE_FULL);
    return data.current ?? {};
  } catch {
    try {
      const data = await request("sea_surface_temperature");
      return data.current ?? {};
    } catch {
      return {};
    }
  }
}

/**
 * Fetches current conditions for a coordinate. Forecast (air/wind/pressure) and
 * marine (water temp) are requested in parallel. Returns `null` if the forecast
 * call fails (treated as offline); water temp degrades to `null` on its own.
 */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const [forecast, marine] = await Promise.all([
      fetchJson<ForecastResponse>(
        buildUrl(FORECAST_URL, {
          latitude: coarse(lat),
          longitude: coarse(lng),
          current:
            "temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure," +
            "apparent_temperature,relative_humidity_2m,pressure_msl,wind_gusts_10m," +
            "cloud_cover,precipitation,weather_code,is_day",
          wind_speed_unit: "ms"
        })
      ),
      fetchMarine(lat, lng)
    ]);

    const current = forecast.current;
    if (
      !current ||
      typeof current.temperature_2m !== "number" ||
      typeof current.wind_speed_10m !== "number" ||
      typeof current.wind_direction_10m !== "number" ||
      typeof current.surface_pressure !== "number"
    ) {
      return null;
    }

    return {
      airTemp: current.temperature_2m,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      pressure: current.surface_pressure,
      waterTemp: num(marine?.sea_surface_temperature) ?? null,

      apparentTemp: num(current.apparent_temperature),
      humidity: num(current.relative_humidity_2m),
      pressureMsl: num(current.pressure_msl),
      windGust: num(current.wind_gusts_10m),
      cloudCover: num(current.cloud_cover),
      precipitation: num(current.precipitation),
      weatherCode: num(current.weather_code),
      isDay: num(current.is_day),

      waveHeight: num(marine?.wave_height),
      waveDirection: num(marine?.wave_direction),
      wavePeriod: num(marine?.wave_period),
      currentVelocity: num(marine?.ocean_current_velocity),
      currentDirection: num(marine?.ocean_current_direction),
      seaLevelMsl: num(marine?.sea_level_height_msl)
    };
  } catch {
    // Offline / API error — weather is optional, so never throw.
    return null;
  }
}

// --- Persistence ------------------------------------------------------------

function toSnapshot(
  eventId: string,
  data: WeatherData,
  water?: { level: number; trend: string } | null
): WeatherSnapshot {
  return {
    // Deterministic id keyed on the event so re-syncing is idempotent.
    id: `wx-${eventId}`,
    eventId,
    airTemp: data.airTemp,
    waterTemp: data.waterTemp ?? undefined,
    windSpeed: data.windSpeed,
    // Stored as a compass label (the wind_direction column is TEXT).
    windDirection: degreesToCompass(data.windDirection),
    pressure: data.pressure,
    // Only present when the caller had a live reading. The back-fill paths pass
    // nothing: a tide measured days after the catch is not that catch's tide,
    // and a wrong value is worse here than a missing one.
    waterLevel: water?.level,
    waterLevelTrend: water?.trend,

    apparentTemp: data.apparentTemp,
    humidity: data.humidity,
    pressureMsl: data.pressureMsl,
    windGust: data.windGust,
    cloudCover: data.cloudCover,
    precipitation: data.precipitation,
    weatherCode: data.weatherCode,
    isDay: data.isDay,

    waveHeight: data.waveHeight,
    waveDirection: data.waveDirection,
    wavePeriod: data.wavePeriod,
    currentVelocity: data.currentVelocity,
    currentDirection: data.currentDirection,
    seaLevelMsl: data.seaLevelMsl
  };
}

/**
 * Immediately writes already-fetched weather data as a snapshot for `eventId`.
 * No network call — uses whatever the caller already has. Call this when the
 * store's weather object is available so every event type gets conditions
 * without an extra API round-trip.
 */
export function storeWeatherForEvent(
  eventId: string,
  data: WeatherData,
  water?: { level: number; trend: string } | null
): void {
  enqueueWrite((db) => insertWeatherSnapshot(db, toSnapshot(eventId, data, water)));
}

/**
 * Fetches and persists weather for a single event. Non-blocking by design:
 * call it with `void`. If offline, it no-ops and the event is left for
 * `syncPendingWeather` to back-fill later.
 */
export async function captureWeatherForEvent(
  eventId: string,
  lat: number,
  lng: number
): Promise<void> {
  const data = await fetchWeather(lat, lng);
  if (!data) {
    return;
  }
  enqueueWrite((db) => insertWeatherSnapshot(db, toSnapshot(eventId, data)));
}

// --- Connectivity + offline back-fill ---------------------------------------

/** Best-effort connectivity check. Unknown reachability is treated as online. */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) {
      return false;
    }
    // isInternetReachable may be undefined on some platforms — don't block on it.
    return state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

/**
 * Finds events with no weather snapshot (typically created offline) and fetches
 * their conditions now. Safe to call on every app start; no-ops when offline.
 */
export async function syncPendingWeather(): Promise<void> {
  if (!(await isOnline())) {
    return;
  }

  try {
    const db = await getDb();
    const missing = await getEventsMissingWeather(db);
    for (const event of missing) {
      const data = await fetchWeather(event.latitude, event.longitude);
      if (data) {
        enqueueWrite((write) => insertWeatherSnapshot(write, toSnapshot(event.id, data)));
      }
    }
  } catch (error) {
    console.warn("[strike/weather] syncPendingWeather failed", error);
  }
}
