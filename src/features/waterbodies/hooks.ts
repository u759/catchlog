import { useMemo } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useUserId } from '@/features/catches/hooks';
import { db, useLiveQuery } from '@/lib/sync/db';

export type DepthMap = { title: string; url: string; source: string; licence: string };
export type Waterbody = {
  id: string;
  region: string;
  kind: string;
  name: string | null;
  area_ha: number | null;
  max_depth_m: number | null;
  mean_depth_m: number | null;
  depth_maps: DepthMap[];
  lat: number;
  lng: number;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  /** Digital depth contours exist for this lake (shown on the map when zoomed in). */
  has_contours: boolean;
};

const toWaterbody = (r: Record<string, unknown>): Waterbody => ({
  ...(r as Omit<Waterbody, 'depth_maps' | 'has_contours'>),
  has_contours: !!r.has_contours,
  depth_maps: (() => {
    try {
      return JSON.parse(String(r.depth_maps ?? '[]')) as DepthMap[];
    } catch {
      return [];
    }
  })(),
});

export function useWaterbody(id: string | null | undefined) {
  const { data } = useLiveQuery<Record<string, unknown>>('SELECT * FROM waterbodies WHERE id = ?', [id ?? ''], ['waterbodies']);
  const row = data[0];
  return useMemo(() => (row ? toWaterbody(row) : null), [row]);
}

/** Species recorded in a waterbody, plus whether you've caught each. */
export function useWaterbodySpecies(id: string | null | undefined) {
  const userId = useUserId() ?? '';
  return useLiveQuery<{ species_id: string; common_name: string; dex_no: number; game_fish: number; thumb: string | null;
    observations: number; last_observed: string | null; mine: number }>(
    `SELECT s.id AS species_id, s.common_name, s.dex_no, s.game_fish, p.image_thumb_url AS thumb,
            sum(ws.observations) AS observations, max(ws.last_observed) AS last_observed,
            (SELECT count(*) FROM catches c WHERE c.user_id = ? AND c.species_id = s.id) AS mine
     FROM waterbody_species ws JOIN species s ON s.id = ws.species_id
     LEFT JOIN species_profiles p ON p.species_id = s.id
     WHERE ws.waterbody_id = ?
     GROUP BY s.id ORDER BY s.game_fish DESC, observations DESC`,
    [userId, id ?? ''],
    ['waterbody_species', 'species', 'species_profiles', 'catches'],
  ).data;
}

/**
 * Best local guess of the waterbody at a point, using bounding boxes (works offline). The server
 * replaces it with an exact polygon match when the catch uploads.
 */
/**
 * Offline guess of the lake at a point, mirroring the server's rule (nearest lake within 300 m) with
 * bounding boxes instead of outlines: the smallest lake whose box, padded by 300 m, contains the point.
 * The server replaces it with the exact answer when the catch syncs.
 */
export async function detectWaterbody(lat: number, lng: number): Promise<Waterbody | null> {
  const dLat = 300 / 111_320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM waterbodies WHERE south - ? <= ? AND north + ? >= ? AND west - ? <= ? AND east + ? >= ?
     ORDER BY area_ha ASC LIMIT 1`,
    [dLat, lat, dLat, lat, dLng, lng, dLng, lng],
  );
  return row ? toWaterbody(row) : null;
}

/** Species ids recorded in a waterbody (for boosting suggestions in the catch form). */
export async function speciesInWaterbody(id: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ species_id: string }>(
    'SELECT DISTINCT species_id FROM waterbody_species WHERE waterbody_id = ?',
    [id],
  );
  return new Set(rows.map((r) => r.species_id));
}

// ── depth maps (official PDFs) — downloaded once, then opened offline ─────────
const mapsDir = () => new Directory(Paths.document, 'depth-maps');
const mapFile = (url: string) => new File(mapsDir(), `${url.replace(/[^a-z0-9]+/gi, '_').slice(-80)}.pdf`);

export const isDepthMapSaved = (url: string) => mapFile(url).exists;

export async function openDepthMap(url: string) {
  const file = mapFile(url);
  if (!file.exists) {
    const dir = mapsDir();
    if (!dir.exists) dir.create({ intermediates: true });
    await File.downloadFileAsync(url, file, { idempotent: true });
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Depth map' });
}
