// Server-side reads for data that isn't synced to the device (other anglers' catches).
// Your own catches come from local SQLite (see hooks.ts, src/lib/sync).
import type { Tables } from '@/lib/database.types';
import { PHOTO_BUCKET, supabase } from '@/lib/supabase';

import { parseConditions } from '@/features/conditions/model';

import type { CatchView } from './model';

type ServerCatch = Tables<'catches'> & {
  species: { common_name: string; common_name_fr: string | null; scientific_name: string } | null;
  catch_photos: { id: string; path: string; position: number }[];
};

export async function signedPhotoUrl(path: string | null, ttlSeconds = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, ttlSeconds);
  return data?.signedUrl ?? null;
}

/** A catch you can see but don't own (a friend's or a public one). RLS decides visibility. */
export async function fetchRemoteCatch(id: string): Promise<CatchView | null> {
  const { data, error } = await supabase
    .from('catches')
    .select('*, species(common_name, common_name_fr, scientific_name), catch_photos(id, path, position)')
    .is('catch_photos.deleted_at', null)
    .eq('id', id)
    .maybeSingle<ServerCatch>();
  if (error) throw error;
  if (!data) return null;
  const { catch_photos: rows, ...row } = data;
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const refs = sorted.length ? sorted : data.photo_path ? [{ id: data.photo_path, path: data.photo_path, position: 0 }] : [];
  const photos = await Promise.all(refs.map(async (p) => ({ id: p.id, path: p.path, url: await signedPhotoUrl(p.path) })));
  return {
    ...row,
    photos,
    weather: (data.weather as CatchView['weather']) ?? null,
    conditions: parseConditions(data.conditions),
    visibility: data.visibility as CatchView['visibility'],
    photo_url: photos[0]?.url ?? null,
  };
}
