import Fuse from 'fuse.js';
import { useMemo } from 'react';

import { useLiveQuery } from '@/lib/sync/db';

// Species are synced into local SQLite (downloaded once, then only changed rows),
// so search is instant and works offline. Fuzzy matching tolerates typos ("walley", "smallmoth").

export type SpeciesOption = {
  id: string;
  common_name: string;
  common_name_fr: string | null;
  scientific_name: string;
  game_fish: boolean;
  in_canada: boolean;
  regions: string[];
  lw_a: number | null;
  lw_b: number | null;
  max_length_mm: number | null;
};

// Wild Species region codes. Newfoundland and Labrador are separate regions (NF, LB).
const PROVINCES: Record<string, string[]> = {
  'british columbia': ['BC'], alberta: ['AB'], saskatchewan: ['SK'], manitoba: ['MB'], ontario: ['ON'],
  quebec: ['QC'], québec: ['QC'], 'new brunswick': ['NB'], 'nova scotia': ['NS'], 'prince edward island': ['PE'],
  'newfoundland and labrador': ['NF', 'LB'], yukon: ['YT'], 'northwest territories': ['NT'], nunavut: ['NU'],
  bc: ['BC'], ab: ['AB'], sk: ['SK'], mb: ['MB'], on: ['ON'], qc: ['QC'], nb: ['NB'], ns: ['NS'], pe: ['PE'],
  nl: ['NF', 'LB'], yt: ['YT'], nt: ['NT'], nu: ['NU'],
};

/** Maps a reverse-geocoded region ("Ontario", "ON") to Wild Species region codes, if in Canada. */
export function regionCodes(region: string | null | undefined, isoCountry: string | null | undefined): string[] {
  if (!region || (isoCountry && isoCountry.toUpperCase() !== 'CA')) return [];
  return PROVINCES[region.trim().toLowerCase()] ?? [];
}

function parseRegions(v: unknown): string[] {
  if (typeof v !== 'string' || !v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return v.replace(/[{}]/g, '').split(',').filter(Boolean);
  }
}

/** All species from local SQLite (≈1.4k small rows), plus a fuzzy index over their names. */
export function useSpeciesIndex() {
  const { data } = useLiveQuery<Record<string, unknown> & { id: string }>(
    `SELECT id, common_name, common_name_fr, scientific_name, game_fish, in_canada, regions, lw_a, lw_b, max_length_mm
     FROM species`,
    [],
    ['species'],
  );
  return useMemo(() => {
    const list: SpeciesOption[] = data.map((r) => ({
      id: r.id,
      common_name: r.common_name as string,
      common_name_fr: (r.common_name_fr as string) ?? null,
      scientific_name: r.scientific_name as string,
      game_fish: !!r.game_fish,
      in_canada: !!r.in_canada,
      regions: parseRegions(r.regions),
      lw_a: (r.lw_a as number) ?? null,
      lw_b: (r.lw_b as number) ?? null,
      max_length_mm: (r.max_length_mm as number) ?? null,
    }));
    const fuse = new Fuse(list, {
      keys: [
        { name: 'common_name', weight: 3 },
        { name: 'common_name_fr', weight: 2 },
        { name: 'scientific_name', weight: 1 },
      ],
      includeScore: true,
      ignoreLocation: true,
      ignoreDiacritics: true,
      threshold: 0.35,
    });
    return { list, byId: new Map(list.map((s) => [s.id, s])), fuse };
  }, [data]);
}

/**
 * Picker suggestions. Typed text: fuzzy match, nudged toward game fish and your province.
 * Empty: game fish found in your province first.
 */
export function searchSpecies(
  index: ReturnType<typeof useSpeciesIndex>,
  query: string,
  regions: string[],
  limit = 8,
  inLake: Set<string> = new Set(),
): SpeciesOption[] {
  const local = (s: SpeciesOption) => regions.some((r) => s.regions.includes(r));
  const q = query.trim();

  if (!q) {
    // Fish recorded in this lake first, then game fish in your province.
    return index.list
      .filter((s) => inLake.has(s.id) || (s.game_fish && s.in_canada))
      .sort((a, b) =>
        Number(inLake.has(b.id) && b.game_fish) - Number(inLake.has(a.id) && a.game_fish) ||
        Number(inLake.has(b.id)) - Number(inLake.has(a.id)) ||
        Number(local(b)) - Number(local(a)) || a.common_name.localeCompare(b.common_name))
      .slice(0, limit);
  }

  return index.fuse
    .search(q, { limit: 40 })
    .map(({ item, score = 1 }) => ({
      item,
      // lower is better; small boosts so a common local game fish beats an obscure exact-ish match
      rank: score - (inLake.has(item.id) ? 0.1 : 0) - (item.game_fish ? 0.08 : 0) - (local(item) ? 0.06 : 0) - (item.in_canada ? 0.02 : 0),
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((x) => x.item);
}
