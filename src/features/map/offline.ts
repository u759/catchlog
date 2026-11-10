import { OfflineManager } from '@maplibre/maplibre-react-native';

// Limits for map areas saved offline (MapLibre offline packs).
/** OpenFreeMap terms: at most 3,000 tiles per download (https://openfreemap.org/tos/). */
export const MAX_PACK_TILES = 3000;
/** Every saved area must include street-level detail; with the tile cap this keeps one area to ~70 × 70 km. */
export const MIN_DETAIL_ZOOM = 14;
/** Most detailed zoom saved when the tile cap allows it. */
export const MAX_DETAIL_ZOOM = 16;
/** Least detailed zoom saved (regional overview). */
export const PACK_MIN_ZOOM = 8;
/** Total storage for all saved areas on the phone. */
export const MAX_OFFLINE_BYTES = 300 * 1_048_576;

export type Bounds = [west: number, south: number, east: number, north: number];

/** Bytes used by all saved areas. */
export async function offlineBytes(): Promise<number> {
  const packs = await OfflineManager.getPacks();
  const sizes = await Promise.all(packs.map(async (p) => (await p.status()).completedResourceSize));
  return sizes.reduce((a, b) => a + b, 0);
}

/** Number of web-mercator tiles covering bounds over a zoom range. */
export function tileCount([w, s, e, n]: Bounds, minZ: number, maxZ: number) {
  const x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const y = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  let total = 0;
  for (let z = minZ; z <= maxZ; z++) total += (Math.abs(x(e, z) - x(w, z)) + 1) * (Math.abs(y(s, z) - y(n, z)) + 1);
  return total;
}

/** A square on the map (square on screen: in web mercator a degree of latitude is 1/cos(lat) longer). */
export function squareBounds([lng, lat]: [number, number], halfLngDeg: number): Bounds {
  const halfLat = halfLngDeg * Math.cos((lat * Math.PI) / 180);
  return [lng - halfLngDeg, lat - halfLat, lng + halfLngDeg, lat + halfLat];
}

/** Half-width (degrees of longitude) of the largest square at `center` that can be saved with street-level detail. */
export function maxHalfSpan(center: [number, number]): number {
  let lo = 0;
  let hi = 5;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (tileCount(squareBounds(center, mid), PACK_MIN_ZOOM, MIN_DETAIL_ZOOM) <= MAX_PACK_TILES) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Most detailed zoom (≤ MAX_DETAIL_ZOOM) whose download fits the tile cap. */
export function packMaxZoom(bounds: Bounds): number {
  let z = MAX_DETAIL_ZOOM;
  while (z > PACK_MIN_ZOOM && tileCount(bounds, PACK_MIN_ZOOM, z) > MAX_PACK_TILES) z -= 1;
  return z;
}
