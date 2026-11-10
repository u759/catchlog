// Server-side reads for data that isn't synced to the device (other anglers' catches).
// Your own catches come from local SQLite (see hooks.ts, src/lib/sync).
import type { Tables } from '@/lib/database.types';
import { PHOTO_BUCKET, supabase } from '@/lib/supabase';

import type { CatchView } from './model';

type ServerCatch = Tables<'catches'> & {
  species: { common_name: string; common_name_fr: string | null; scientific_name: string } | null;
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
    .select('*, species(common_name, common_name_fr, scientific_name)')
    .eq('id', id)
    .maybeSingle<ServerCatch>();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    weather: (data.weather as CatchView['weather']) ?? null,
    visibility: data.visibility as CatchView['visibility'],
    photo_url: await signedPhotoUrl(data.photo_path),
  };
}
