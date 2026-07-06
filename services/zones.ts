/**
 * Predefined fishing zones around Als. The zone is the most granular location
 * STRIKE ever shares to the Bite Map — exact GPS never leaves the device.
 */

export type Zone = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
};

export const ZONES: Zone[] = [
  { id: 1, name: "Nordals Vest", latitude: 55.0833, longitude: 9.8667 },
  { id: 2, name: "Nordals Nord", latitude: 55.0667, longitude: 10.0167 },
  { id: 3, name: "Østkysten", latitude: 54.9833, longitude: 10.0333 },
  { id: 4, name: "Sydals Øst", latitude: 54.9333, longitude: 9.9833 },
  { id: 5, name: "Sydals Syd/Kegnæs", latitude: 54.8833, longitude: 9.9167 },
  { id: 6, name: "Sønderborg Bugt", latitude: 54.9167, longitude: 9.8 },
  { id: 7, name: "Augustenborg Fjord", latitude: 54.9667, longitude: 9.8833 },
  { id: 8, name: "Als Fjord", latitude: 55.0167, longitude: 9.8 },
  { id: 9, name: "Nørreskoven", latitude: 55.0333, longitude: 10.05 }
];

/** Map center for the Bite Map view (rough center of Als). */
export const ALS_CENTER = { latitude: 55.0, longitude: 9.9 };

const MAX_ZONE_DISTANCE_KM = 15;
const EARTH_RADIUS_KM = 6371;

function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Returns the id of the nearest zone whose center is within 15 km of the given
 * coordinate, or `null` if the position is outside all zones (e.g. fishing
 * somewhere other than Als).
 */
export function detectZone(lat: number, lng: number): number | null {
  let bestId: number | null = null;
  let bestDistance = MAX_ZONE_DISTANCE_KM;
  for (const zone of ZONES) {
    const d = distanceKm(lat, lng, zone.latitude, zone.longitude);
    if (d <= bestDistance) {
      bestDistance = d;
      bestId = zone.id;
    }
  }
  return bestId;
}

export function zoneName(zoneId: number): string {
  return ZONES.find((zone) => zone.id === zoneId)?.name ?? `Zone ${zoneId}`;
}
