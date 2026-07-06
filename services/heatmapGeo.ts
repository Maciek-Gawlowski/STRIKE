export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/**
 * Converts a lat/lng to pixel XY inside a MapView container, assuming the
 * region maps linearly onto the container (true for the locked, non-rotated,
 * non-tilted Bite Map view — not a general Mercator projection).
 */
export function latLngToXY(
  lat: number,
  lng: number,
  region: MapRegion,
  width: number,
  height: number
): { x: number; y: number } {
  const x = ((lng - (region.longitude - region.longitudeDelta / 2)) / region.longitudeDelta) * width;
  const y = (1 - (lat - (region.latitude - region.latitudeDelta / 2)) / region.latitudeDelta) * height;
  return { x, y };
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
