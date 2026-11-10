import { useMemo } from 'react';

import { useUserId } from '@/features/catches/hooks';
import { useLiveQuery } from '@/lib/sync/db';

export type DexEntry = {
  id: string;
  dex_no: number;
  common_name: string;
  scientific_name: string;
  family: string | null;
  /** FishBase's common name for the family, e.g. 'Salmonids' (Dex groups). */
  family_common: string | null;
  game_fish: boolean;
  in_canada: boolean;
  regions: string[];
  thumb: string | null;
  caught: number;
  pb_length_mm: number | null;
  pb_weight_g: number | null;
  best_photo: string | null;
  lakes: number; // waterbodies where it has been recorded
  environment: string | null;
};

const parseRegions = (v: unknown) => {
  try {
    const r = JSON.parse(String(v ?? '[]'));
    return Array.isArray(r) ? (r as string[]) : [];
  } catch {
    return [];
  }
};

/** Every species with your catch stats (count, personal bests) — all local SQLite. */
export function useDex() {
  const userId = useUserId() ?? '';
  const { data, isLoading } = useLiveQuery<Record<string, unknown>>(
    `SELECT s.id, s.dex_no, s.common_name, s.scientific_name, s.family, s.family_common, s.game_fish, s.in_canada, s.regions,
            p.image_thumb_url AS thumb, p.environment,
            coalesce(c.n, 0) AS caught, c.pb_length_mm, c.pb_weight_g,
            (SELECT photo_path FROM catches x WHERE x.user_id = ?1 AND x.species_id = s.id AND x.photo_path IS NOT NULL
               ORDER BY x.length_mm DESC NULLS LAST LIMIT 1) AS best_photo,
            coalesce(w.lakes, 0) AS lakes
     FROM species s
     LEFT JOIN species_profiles p ON p.species_id = s.id
     LEFT JOIN (SELECT species_id, count(*) AS n, max(length_mm) AS pb_length_mm, max(weight_g) AS pb_weight_g
                FROM catches WHERE user_id = ?1 GROUP BY species_id) c ON c.species_id = s.id
     LEFT JOIN (SELECT species_id, count(DISTINCT waterbody_id) AS lakes FROM waterbody_species GROUP BY species_id) w
       ON w.species_id = s.id
     ORDER BY s.dex_no`,
    [userId],
    ['species', 'species_profiles', 'catches', 'waterbody_species'],
  );
  const entries = useMemo(
    () =>
      data.map(
        (r): DexEntry => ({
          id: r.id as string,
          dex_no: (r.dex_no as number) ?? 0,
          common_name: r.common_name as string,
          scientific_name: r.scientific_name as string,
          family: (r.family as string) ?? null,
          family_common: (r.family_common as string) ?? null,
          game_fish: !!r.game_fish,
          in_canada: !!r.in_canada,
          regions: parseRegions(r.regions),
          thumb: (r.thumb as string) ?? null,
          caught: (r.caught as number) ?? 0,
          pb_length_mm: (r.pb_length_mm as number) ?? null,
          pb_weight_g: (r.pb_weight_g as number) ?? null,
          best_photo: (r.best_photo as string) ?? null,
          lakes: (r.lakes as number) ?? 0,
          environment: (r.environment as string) ?? null,
        }),
      ),
    [data],
  );
  return { entries, isLoading };
}

export type SpeciesProfile = Record<string, unknown> & {
  species_id: string;
  summary: string | null;
  summary_url: string | null;
  habitat: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  image_author: string | null;
  image_license: string | null;
  image_page_url: string | null;
};

export function useSpecies(id: string | undefined) {
  const { data } = useLiveQuery<Record<string, unknown>>(
    `SELECT s.*, p.* FROM species s LEFT JOIN species_profiles p ON p.species_id = s.id WHERE s.id = ?`,
    [id ?? ''],
    ['species', 'species_profiles'],
  );
  return data[0] ?? null;
}

/** Waterbodies where a species has been recorded, with your catches of it there. */
export function useSpeciesLakes(speciesId: string | undefined) {
  const userId = useUserId() ?? '';
  return useLiveQuery<{ id: string; name: string | null; region: string; lat: number; lng: number;
    observations: number; last_observed: string | null; mine: number }>(
    `SELECT w.id, w.name, w.region, w.lat, w.lng, sum(ws.observations) AS observations,
            max(ws.last_observed) AS last_observed,
            (SELECT count(*) FROM catches c WHERE c.user_id = ? AND c.waterbody_id = w.id AND c.species_id = ws.species_id) AS mine
     FROM waterbody_species ws JOIN waterbodies w ON w.id = ws.waterbody_id
     WHERE ws.species_id = ?
     GROUP BY w.id`,
    [userId, speciesId ?? ''],
    ['waterbody_species', 'waterbodies', 'catches'],
  ).data;
}

/** Regions of the lakes on this phone (e.g. ['BC']), for labelling the lake view. */
export function useLakeRegions() {
  const { data } = useLiveQuery<{ region: string }>(
    'SELECT DISTINCT region FROM waterbodies WHERE region IS NOT NULL ORDER BY region',
    [],
    ['waterbodies'],
  );
  return useMemo(() => data.map((r) => r.region), [data]);
}

/** "Near me" radius. */
export const NEAR_KM = 50;

/**
 * Species recorded in lakes around a point (a ~50 km box, local data, works offline):
 * species id → number of those lakes.
 */
export function useNearbySpecies(here: { lat: number; lng: number } | null) {
  const dLat = NEAR_KM / 111.32;
  const dLng = here ? dLat / Math.cos((here.lat * Math.PI) / 180) : 0;
  const { data } = useLiveQuery<{ species_id: string; n: number }>(
    `SELECT ws.species_id, count(DISTINCT ws.waterbody_id) AS n
     FROM waterbody_species ws JOIN waterbodies w ON w.id = ws.waterbody_id
     WHERE w.lat BETWEEN ? AND ? AND w.lng BETWEEN ? AND ?
     GROUP BY ws.species_id`,
    here ? [here.lat - dLat, here.lat + dLat, here.lng - dLng, here.lng + dLng] : [1, 0, 1, 0],
    ['waterbody_species', 'waterbodies'],
  );
  return useMemo(() => new Map(data.map((r) => [r.species_id, r.n])), [data]);
}
