import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';
import { useLiveQuery } from '@/lib/sync/db';
import { requestSync, useSyncStatus, writeLocal } from '@/lib/sync/engine';
import { adoptPhoto, deleteLocalPhoto, photoPathFor, queuePhoto } from '@/lib/sync/photos';

import { fetchRemoteCatch } from './api';
import { type CatchView, fromLocal, LOCAL_CATCH_SELECT, type LocalCatchRow } from './model';
import { compressPhoto } from './photos';

export function useUserId() {
  return useAuth().session?.user.id ?? null;
}

export type LogbookFilter = 'all' | 'today' | 'trophies';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Your catches from local SQLite, newest first, `limit` at a time (grow it to page in more).
 * julianday() normalises timestamps written locally (ISO "T") and synced ones (space).
 */
export function useLogbook(filter: LogbookFilter, limit: number) {
  const userId = useUserId() ?? '';
  const [sql, params] = useMemo((): [string, unknown[]] => {
    switch (filter) {
      case 'today':
        return [
          `${LOCAL_CATCH_SELECT} WHERE c.user_id = ? AND julianday(c.caught_at) >= julianday(?)
           ORDER BY julianday(c.caught_at) DESC LIMIT ?`,
          [userId, startOfToday(), limit],
        ];
      case 'trophies':
        return [
          `${LOCAL_CATCH_SELECT} WHERE c.user_id = ? AND c.length_mm IS NOT NULL
           ORDER BY c.length_mm DESC, c.weight_g DESC LIMIT ?`,
          [userId, Math.min(limit, 10)],
        ];
      default:
        return [`${LOCAL_CATCH_SELECT} WHERE c.user_id = ? ORDER BY julianday(c.caught_at) DESC LIMIT ?`, [userId, limit]];
    }
  }, [filter, limit, userId]);
  const { data, isLoading } = useLiveQuery<LocalCatchRow>(sql, params as never, ['catches', 'species']);
  return { catches: useMemo(() => data.map(fromLocal), [data]), isLoading };
}

export function useLogbookStats() {
  const userId = useUserId() ?? '';
  const { data } = useLiveQuery<{ total: number; today: number; weight: number | null }>(
    `SELECT count(*) AS total,
            coalesce(sum(julianday(caught_at) >= julianday(?)), 0) AS today,
            sum(weight_g) AS weight
     FROM catches WHERE user_id = ?`,
    [startOfToday(), userId],
    ['catches'],
  );
  return data[0] ?? { total: 0, today: 0, weight: 0 };
}

export function useBestCatch() {
  const userId = useUserId() ?? '';
  const { data } = useLiveQuery<LocalCatchRow>(
    `${LOCAL_CATCH_SELECT} WHERE c.user_id = ? AND c.length_mm IS NOT NULL
     ORDER BY c.length_mm DESC, c.weight_g DESC LIMIT 1`,
    [userId],
    ['catches', 'species'],
  );
  return data[0] ? fromLocal(data[0]) : null;
}

/** Your catch from local SQLite; otherwise (a friend's / public) fetched from the server. */
export function useCatch(id: string | undefined) {
  const { data: local, isLoading: localLoading } = useLiveQuery<LocalCatchRow>(
    `${LOCAL_CATCH_SELECT} WHERE c.id = ?`,
    [id ?? ''],
    ['catches', 'species'],
  );
  const localCatch = local[0] ? fromLocal(local[0]) : null;
  const remote = useQuery({
    queryKey: ['remote-catch', id],
    queryFn: () => fetchRemoteCatch(id!),
    enabled: !!id && !localLoading && !localCatch,
  });
  return {
    data: localCatch ?? remote.data ?? null,
    isLoading: localLoading || (!localCatch && remote.isLoading),
  };
}

/** Sync state for banners: unsent changes, connectivity, first-sync status. */
export function usePendingUploads() {
  const st = useSyncStatus();
  return { count: st.pending, connected: st.online, hasSynced: st.hasSynced, syncing: st.syncing };
}

export const refreshSync = () => requestSync();

// ── writes (local first; src/lib/sync uploads when online) ──────────────────────

export type CatchInput = Omit<CatchView, 'id' | 'user_id' | 'species' | 'photo_path' | 'photo_url'>;
export type NewPhoto = { uri: string; width?: number; height?: number };

const COLUMNS = [
  'species_id', 'species_other', 'length_mm', 'weight_g', 'weight_estimated', 'caught_at', 'lat', 'lng',
  'place_name', 'waterbody', 'lure', 'line_lb', 'notes', 'weather', 'released', 'visibility', 'gear_id', 'waterbody_id',
] as const;

/** Local SQLite values (0/1 booleans, JSON text). */
function toLocal(input: CatchInput) {
  return COLUMNS.map((c) => {
    const v = input[c];
    if (c === 'weather') return v ? JSON.stringify(v) : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return (v ?? null) as string | number | null;
  });
}

/**
 * Creates or updates a catch locally (instant, works offline) and queues it for upload.
 * A new photo is compressed, kept on-device, and queued for upload separately.
 */
export async function saveCatch(opts: {
  id?: string;
  userId: string;
  input: CatchInput;
  photo?: NewPhoto | null;
  previousPhotoPath?: string | null;
}) {
  const id = opts.id ?? Crypto.randomUUID();
  const isNew = !opts.id;
  const now = new Date().toISOString();

  let photoPath: string | undefined;
  if (opts.photo) {
    const tempUri = await compressPhoto(opts.photo.uri, opts.photo.width, opts.photo.height);
    photoPath = photoPathFor(opts.userId, Crypto.randomUUID());
    adoptPhoto(tempUri, photoPath);
  }

  // What the server gets (Postgres types).
  const serverData: Record<string, unknown> = {
    ...Object.fromEntries(COLUMNS.map((c) => [c, opts.input[c] ?? null])),
    user_id: opts.userId,
    ...(photoPath ? { photo_path: photoPath } : {}),
  };

  await writeLocal(
    async (txn) => {
      const values = toLocal(opts.input);
      if (isNew) {
        await txn.runAsync(
          `INSERT INTO catches (id, user_id, ${COLUMNS.join(', ')}, photo_path, created_at, updated_at)
           VALUES (?, ?, ${COLUMNS.map(() => '?').join(', ')}, ?, ?, ?)`,
          [id, opts.userId, ...values, photoPath ?? null, now, now],
        );
      } else {
        await txn.runAsync(
          `UPDATE catches SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}${photoPath ? ', photo_path = ?' : ''},
             updated_at = ? WHERE id = ?`,
          [...values, ...(photoPath ? [photoPath] : []), now, id],
        );
      }
      if (photoPath) {
        await txn.runAsync(
          `INSERT OR REPLACE INTO photo_queue (path, action, attempts, next_try_at) VALUES (?, 'upload', 0, 0)`,
          [photoPath],
        );
      }
      if (photoPath && opts.previousPhotoPath) {
        await txn.runAsync(
          `INSERT OR REPLACE INTO photo_queue (path, action, attempts, next_try_at) VALUES (?, 'delete', 0, 0)`,
          [opts.previousPhotoPath],
        );
      }
    },
    [isNew ? { tbl: 'catches', op: 'upsert', id, data: serverData } : { tbl: 'catches', op: 'update', id, data: serverData }],
  );
  if (photoPath && opts.previousPhotoPath) deleteLocalPhoto(opts.previousPhotoPath);
  return id;
}

/** Soft delete (a tombstone, so your other devices remove it too). */
export async function deleteCatch(id: string, photoPath: string | null) {
  await writeLocal(
    async (txn) => {
      await txn.runAsync('DELETE FROM catches WHERE id = ?', [id]);
    },
    [{ tbl: 'catches', op: 'update', id, data: { deleted_at: new Date().toISOString() } }],
  );
  if (photoPath) {
    deleteLocalPhoto(photoPath);
    await queuePhoto(photoPath, 'delete');
  }
}
