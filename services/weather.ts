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
  pressure: number; // hPa
  waterTemp: number | null; // °C, null for inland / unavailable
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
  };
};

type MarineResponse = {
  current?: {
    sea_surface_temperature?: number | null;
  };
};

function buildUrl(base: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${base}?${query}`;
}

/** Sea-surface temperature is optional; failures/inland nulls resolve to null. */
async function fetchWaterTemp(lat: number, lng: number): Promise<number | null> {
  try {
    const data = await fetchJson<MarineResponse>(
      buildUrl(MARINE_URL, {
        latitude: String(lat),
        longitude: String(lng),
        current: "sea_surface_temperature"
      })
    );
    const value = data.current?.sea_surface_temperature;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Fetches current conditions for a coordinate. Forecast (air/wind/pressure) and
 * marine (water temp) are requested in parallel. Returns `null` if the forecast
 * call fails (treated as offline); water temp degrades to `null` on its own.
 */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const [forecast, waterTemp] = await Promise.all([
      fetchJson<ForecastResponse>(
        buildUrl(FORECAST_URL, {
          latitude: String(lat),
          longitude: String(lng),
          current: "temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure",
          wind_speed_unit: "ms"
        })
      ),
      fetchWaterTemp(lat, lng)
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
      waterTemp
    };
  } catch {
    // Offline / API error — weather is optional, so never throw.
    return null;
  }
}

// --- Persistence ------------------------------------------------------------

function toSnapshot(eventId: string, data: WeatherData): WeatherSnapshot {
  return {
    // Deterministic id keyed on the event so re-syncing is idempotent.
    id: `wx-${eventId}`,
    eventId,
    airTemp: data.airTemp,
    waterTemp: data.waterTemp ?? undefined,
    windSpeed: data.windSpeed,
    // Stored as a compass label (the wind_direction column is TEXT).
    windDirection: degreesToCompass(data.windDirection),
    pressure: data.pressure
  };
}

/**
 * Immediately writes already-fetched weather data as a snapshot for `eventId`.
 * No network call — uses whatever the caller already has. Call this when the
 * store's weather object is available so every event type gets conditions
 * without an extra API round-trip.
 */
export function storeWeatherForEvent(eventId: string, data: WeatherData): void {
  enqueueWrite((db) => insertWeatherSnapshot(db, toSnapshot(eventId, data)));
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
