import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { PHOTO_BUCKET, supabase } from '@/lib/supabase';

import { db, write } from './db';

// Photos: Supabase Storage key "{user_id}/{photoId}.jpg" (catches.photo_path); on-device copy at
// <documents>/photos/{photoId}.jpg. Transfers are queued in photo_queue and streamed natively
// (bytes never enter JS) when online.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

const photosDir = () => new Directory(Paths.document, 'photos');
const fileName = (path: string) => path.split('/').pop()!;
export const localPhotoFile = (path: string) => new File(photosDir(), fileName(path));
export const photoPathFor = (userId: string, photoId: string) => `${userId}/${photoId}.jpg`;

// Local photo files change outside React (background downloads, saves, deletes). Components that show a photo
// subscribe (useLocalPhotoUri) so a photo appears as soon as its download finishes.
const listeners = new Set<() => void>();
function filesChanged() {
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function localPhotoUri(path: string | null | undefined): string | null {
  if (!path) return null;
  const f = localPhotoFile(path);
  return f.exists ? f.uri : null;
}

/** The on-device photo's URI, updating when it's downloaded, saved or deleted. */
export function useLocalPhotoUri(path: string | null | undefined): string | null {
  return useSyncExternalStore(subscribe, () => localPhotoUri(path));
}

/** Moves a (compressed) temp file into the photos dir under the photo's storage key. */
export function adoptPhoto(tempUri: string, path: string) {
  const dir = photosDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = localPhotoFile(path);
  if (dest.exists) dest.delete();
  new File(tempUri).move(dest);
  filesChanged();
}

export function deleteLocalPhoto(path: string) {
  const f = localPhotoFile(path);
  if (f.exists) {
    f.delete();
    filesChanged();
  }
}

export function deleteAllLocalPhotos() {
  const dir = photosDir();
  if (dir.exists) dir.delete();
  filesChanged();
}

type QueueRow = { path: string; action: 'upload' | 'download' | 'delete'; attempts: number };

export async function queuePhoto(path: string, action: QueueRow['action']) {
  await write(
    `INSERT INTO photo_queue (path, action, attempts, next_try_at) VALUES (?, ?, 0, 0)
     ON CONFLICT(path) DO UPDATE SET action = excluded.action, attempts = 0, next_try_at = 0, last_error = NULL`,
    [path, action],
  );
}

async function headers() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Not signed in');
  return { Authorization: `Bearer ${data.session.access_token}`, apikey: SUPABASE_KEY };
}

async function transfer(item: QueueRow) {
  const objectUrl = `${SUPABASE_URL}/storage/v1/object`;
  if (item.action === 'upload') {
    const file = localPhotoFile(item.path);
    if (!file.exists) return; // photo was replaced/deleted locally; nothing to send
    const res = await file.upload(`${objectUrl}/${PHOTO_BUCKET}/${item.path}`, {
      httpMethod: 'POST',
      uploadType: 0, // binary body
      mimeType: 'image/jpeg',
      headers: { ...(await headers()), 'x-upsert': 'true', 'content-type': 'image/jpeg' },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`upload ${res.status}: ${res.body}`);
  } else if (item.action === 'download') {
    if (localPhotoFile(item.path).exists) return;
    const dir = photosDir();
    if (!dir.exists) dir.create({ intermediates: true });
    await File.downloadFileAsync(`${objectUrl}/authenticated/${PHOTO_BUCKET}/${item.path}`, localPhotoFile(item.path), {
      headers: await headers(),
      idempotent: true,
    });
    filesChanged();
  } else {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([item.path]);
    if (error) throw error;
  }
}

/** Processes due photo transfers (a few at a time). Failures back off exponentially. */
export async function processPhotoQueue(batch = 6) {
  const due = await db.getAllAsync<QueueRow>(
    `SELECT path, action, attempts FROM photo_queue WHERE next_try_at <= ?
     ORDER BY action = 'upload' DESC, attempts LIMIT ?`,
    [Date.now(), batch],
  );
  for (const item of due) {
    try {
      await transfer(item);
      await write('DELETE FROM photo_queue WHERE path = ?', [item.path]);
    } catch (e) {
      const wait = Math.min(2 ** item.attempts * 15_000, MAX_BACKOFF_MS);
      await write(
        'UPDATE photo_queue SET attempts = attempts + 1, last_error = ?, next_try_at = ? WHERE path = ?',
        [String(e).slice(0, 300), Date.now() + wait, item.path],
      );
    }
  }
  return due.length;
}
