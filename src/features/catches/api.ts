import { File } from 'expo-file-system';

import type { Tables, TablesInsert } from '@/lib/database.types';
import { PHOTO_BUCKET, supabase } from '@/lib/supabase';

export type Species = Tables<'species'>;

export type Catch = Tables<'catches'> & {
  species: { common_name: string } | null;
  /** Short-lived signed URL for the photo (null if none / offline). */
  photo_url?: string | null;
  /** True while the catch only exists in the local offline queue. */
  _pending?: boolean;
};

/** A catch as written by the app. id + user_id are always set client-side. */
export type CatchDraft = TablesInsert<'catches'> & { id: string; user_id: string };

export type SaveCatchVars = {
  row: CatchDraft;
  /** Local file to upload (set when a new/changed photo was picked). */
  localPhotoUri: string | null;
  /** Species name for optimistic display while offline. */
  speciesName: string | null;
};

export const catchKeys = {
  all: ['catches'] as const,
  mine: (userId: string) => ['catches', 'mine', userId] as const,
  detail: (id: string) => ['catches', 'detail', id] as const,
};

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days; expo-image caches by photo path anyway

async function attachPhotoUrls(rows: Catch[]): Promise<Catch[]> {
  const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
  if (paths.length === 0) return rows;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, photo_url: r.photo_path ? (byPath.get(r.photo_path) ?? null) : null }));
}

export async function fetchMyCatches(userId: string): Promise<Catch[]> {
  const { data, error } = await supabase
    .from('catches')
    .select('*, species(common_name)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('caught_at', { ascending: false });
  if (error) throw error;
  return attachPhotoUrls(data);
}

export async function fetchCatch(id: string): Promise<Catch | null> {
  const { data, error } = await supabase
    .from('catches')
    .select('*, species(common_name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withUrl] = await attachPhotoUrls([data]);
  return withUrl;
}

export async function fetchSpecies(): Promise<Species[]> {
  const { data, error } = await supabase.from('species').select('*').order('common_name');
  if (error) throw error;
  return data;
}

/**
 * The offline-queue worker. Idempotent: the photo upload uses upsert and the row is
 * upserted by its client-generated id, so retries after a dropped connection are safe.
 */
export async function saveCatchRemote({ row, localPhotoUri }: SaveCatchVars): Promise<void> {
  // Upsert only touches columns present in the payload, so an edit without a new photo
  // leaves the existing photo_path alone.
  const payload: CatchDraft = { ...row };
  if (localPhotoUri) {
    payload.photo_path = `${row.user_id}/${row.id}.jpg`;
    const bytes = await new File(localPhotoUri).bytes();
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(payload.photo_path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  }
  const { error } = await supabase.from('catches').upsert(payload);
  if (error) throw error;
}

export async function softDeleteCatch(id: string): Promise<void> {
  const { error } = await supabase
    .from('catches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
