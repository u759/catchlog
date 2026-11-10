import type { Weather } from '@/features/weather/openMeteo';
import { isWeather } from '@/features/weather/openMeteo';

/** A catch as the UI uses it, whether it came from local SQLite (own) or the server (a friend's). */
export type CatchView = {
  id: string;
  user_id: string;
  species_id: string | null;
  species_other: string | null;
  species: { common_name: string; common_name_fr: string | null; scientific_name: string | null } | null;
  length_mm: number | null;
  weight_g: number | null;
  weight_estimated: boolean;
  caught_at: string;
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  waterbody: string | null;
  lure: string | null;
  line_lb: number | null;
  notes: string | null;
  weather: Weather | null;
  photo_path: string | null;
  gear_id: string | null;
  waterbody_id: string | null;
  /** Signed URL, only for catches fetched from the server (friends'). */
  photo_url?: string | null;
  released: boolean;
  visibility: 'private' | 'friends' | 'public';
};

/** Timestamps synced from Postgres use a space ("2026-11-10 03:18:27Z"); Hermes only parses ISO "T". */
export const parseTs = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T'));

export const speciesLabel = (c: Pick<CatchView, 'species' | 'species_other'>) =>
  c.species?.common_name ?? c.species_other ?? 'Unknown species';

function parseWeather(v: unknown): Weather | null {
  if (isWeather(v)) return v;
  if (typeof v === 'string') {
    try {
      const w = JSON.parse(v);
      return isWeather(w) ? w : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Row from `SELECT c.*, s.common_name AS sp_name, s.common_name_fr AS sp_name_fr, s.scientific_name AS sp_sci ...` */
export type LocalCatchRow = Record<string, unknown> & { id: string };

export function fromLocal(r: LocalCatchRow): CatchView {
  return {
    id: r.id,
    user_id: r.user_id as string,
    species_id: (r.species_id as string) ?? null,
    species_other: (r.species_other as string) ?? null,
    species: r.sp_name
      ? {
          common_name: r.sp_name as string,
          common_name_fr: (r.sp_name_fr as string) ?? null,
          scientific_name: (r.sp_sci as string) ?? null,
        }
      : null,
    length_mm: (r.length_mm as number) ?? null,
    weight_g: (r.weight_g as number) ?? null,
    weight_estimated: !!r.weight_estimated,
    caught_at: r.caught_at as string,
    lat: (r.lat as number) ?? null,
    lng: (r.lng as number) ?? null,
    place_name: (r.place_name as string) ?? null,
    waterbody: (r.waterbody as string) ?? null,
    lure: (r.lure as string) ?? null,
    line_lb: (r.line_lb as number) ?? null,
    notes: (r.notes as string) ?? null,
    weather: parseWeather(r.weather),
    photo_path: (r.photo_path as string) ?? null,
    gear_id: (r.gear_id as string) ?? null,
    waterbody_id: (r.waterbody_id as string) ?? null,
    released: !!r.released,
    visibility: ((r.visibility as string) ?? 'friends') as CatchView['visibility'],
  };
}

/** SELECT list used by every local catch query. */
export const LOCAL_CATCH_SELECT = `
  SELECT c.*, s.common_name AS sp_name, s.common_name_fr AS sp_name_fr, s.scientific_name AS sp_sci
  FROM catches c LEFT JOIN species s ON s.id = c.species_id`;
