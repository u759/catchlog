// Satellite map style: EOX Sentinel-2 cloudless 2025 imagery (CC BY-NC-SA 4.0, non-commercial) under the
// OpenFreeMap Liberty labels. Rebuilt from the live Liberty style and published to the public 'map-styles'
// bucket, so the app's satellite view and its offline area downloads share one HTTPS style URL.
import { type Adapter, fetchWithRetry } from './types.ts';

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
const EOX_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';
const EOX_ATTRIBUTION = '<a href="https://cloudless.eox.at">EOxCloudless 2025</a> by EOX IT Services GmbH ' +
  '(Contains modified Copernicus Sentinel data 2025)';
/** Sentinel-2 is 10 m per pixel; zoom 14 is its real detail (the map enlarges it beyond). */
export const SATELLITE_MAX_ZOOM = 14;

type Layer = { id: string; type: string; source?: string };

async function sha1(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const eoxSatelliteStyle: Adapter = {
  key: 'eox-s2cloudless',
  async step(db, _state, ctx) {
    const liberty = await (await fetchWithRetry(LIBERTY)).json();
    // Place, water and road names only: point-of-interest icons (bins, toilets, parking) clutter imagery.
    const labels = (liberty.layers as Layer[]).filter(
      (l) => l.type === 'symbol' && l.source === 'openmaptiles' && !/^(road_one_way_arrow|poi_|airport)/.test(l.id),
    );
    const style = {
      version: 8,
      name: 'CatchLog satellite',
      glyphs: liberty.glyphs,
      sprite: liberty.sprite,
      sources: {
        satellite: { type: 'raster', tiles: [EOX_TILES], tileSize: 256, maxzoom: SATELLITE_MAX_ZOOM, attribution: EOX_ATTRIBUTION },
        openmaptiles: liberty.sources.openmaptiles,
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }, ...labels],
    };
    const json = JSON.stringify(style);
    const version = await sha1(json);
    if (version === ctx.version) return { state: {}, done: true, rows: 0, version };
    const { error } = await db.storage.from('map-styles').upload('satellite.json', new Blob([json], { type: 'application/json' }), {
      upsert: true, contentType: 'application/json', cacheControl: '3600',
    });
    if (error) throw new Error(`upload satellite.json: ${error.message}`);
    return { state: {}, done: true, rows: 1, version };
  },
};
