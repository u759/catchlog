import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';
import { db, useLiveQuery } from '@/lib/sync/db';
import { syncNow, useSyncStatus, writeLocal } from '@/lib/sync/engine';
import { adoptPhoto, deleteLocalPhoto, photoPathFor } from '@/lib/sync/photos';

import { fetchRemoteCatch } from './api';
import { matchSpecies, useSpeciesIndex } from './speciesSearch';
import { type CatchPhotoRef, type CatchView, fromLocal, LOCAL_CATCH_SELECT, type LocalCatchRow, photoIdFromPath } from './model';

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
 * A catch matches if its species is a fuzzy match for the whole query (the shared `matchSpecies`: typos, French
 * and scientific names), or every word appears in the typed species, lake, place, lure or notes.
 */
const TEXT_FIELDS = ['s.common_name', 'c.species_other', 'w.name', 'c.waterbody', 'c.place_name', 'c.lure', 'c.notes'];
function searchWhere(search: string, speciesIds: string[]): [string, string[]] {
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const like = (w: string) => `%${w.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const text = words.map(() => `(${TEXT_FIELDS.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(' OR ')})`).join(' AND ');
  const species = speciesIds.length ? `c.species_id IN (${speciesIds.map(() => '?').join(', ')}) OR ` : '';
  return [`(${species}(${text}))`, [...speciesIds, ...words.flatMap((w) => TEXT_FIELDS.map(() => like(w)))]];
}

/**
 * Your catches from local SQLite, newest first, `limit` at a time (grow it to page in more). A non-empty `search`
 * replaces the filter. julianday() normalises timestamps written locally (ISO "T") and synced ones (space).
 */
export function useLogbook(filter: LogbookFilter, limit: number, search = '') {
  const userId = useUserId() ?? '';
  const speciesIndex = useSpeciesIndex();
  const speciesIds = useMemo(() => matchSpecies(speciesIndex, search), [speciesIndex, search]);
  const [sql, params] = useMemo((): [string, unknown[]] => {
    if (search.trim()) {
      const [where, args] = searchWhere(search, speciesIds);
      return [
        `${LOCAL_CATCH_SELECT} WHERE c.user_id = ? AND ${where} ORDER BY julianday(c.caught_at) DESC LIMIT ?`,
        [userId, ...args, limit],
      ];
    }
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
  }, [filter, limit, userId, search, speciesIds]);
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

/** Pull-to-refresh: resolves when the sync finishes. */
export const refreshSync = () => syncNow();

// ── writes (local first; src/lib/sync uploads when online) ──────────────────────

export type CatchInput = Omit<CatchView, 'id' | 'user_id' | 'species' | 'photo_path' | 'photo_url' | 'photos' | 'conditions' | 'lake_name'>;

/** A photo in the catch form: an existing one (`path`) or a newly picked one (`uri`, already compressed with
 * compressPhoto so "Identify" and the upload send the same bytes). `id` is set at pick time. */
export type FormPhoto = { id: string; path?: string; uri?: string; width?: number; height?: number };
export const MAX_PHOTOS = 6;

/**
 * Photos of a catch in order (the first is the cover). Own catches: local `catch_photos`, falling back to the
 * cover path for catches whose photo rows haven't synced yet. Others' catches: the server read in `useCatch`.
 */
export function useCatchPhotos(c: CatchView | null | undefined): { photos: CatchPhotoRef[]; isLoading: boolean } {
  const { data, isLoading } = useLiveQuery<{ id: string; path: string }>(
    'SELECT id, path FROM catch_photos WHERE catch_id = ? ORDER BY position, created_at',
    [c?.id ?? ''],
    ['catch_photos'],
  );
  const remote = c?.photos;
  const cover = c?.photo_path;
  const photos = useMemo(() => {
    if (remote) return remote;
    if (data.length) return data;
    return cover ? [{ id: photoIdFromPath(cover), path: cover }] : [];
  }, [remote, cover, data]);
  return { photos, isLoading };
}

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

const queueSql = `INSERT OR REPLACE INTO photo_queue (path, action, attempts, next_try_at) VALUES (?, ?, 0, 0)`;

/**
 * Creates or updates a catch locally (instant, works offline) and queues it for upload. `photos` is the full
 * ordered list (first = cover, kept in catches.photo_path); new ones are compressed and kept on the device,
 * removed ones are deleted. Files upload separately through the photo queue.
 */
export async function saveCatch(opts: {
  id?: string;
  userId: string;
  input: CatchInput;
  photos: FormPhoto[];
  previousPhotos: CatchPhotoRef[];
}) {
  const id = opts.id ?? Crypto.randomUUID();
  const isNew = !opts.id;
  const now = new Date().toISOString();

  // New photos (compressed at pick time) move into the photos dir under their storage key.
  const photos: { id: string; path: string; isNew: boolean }[] = [];
  for (const p of opts.photos) {
    if (p.path) {
      photos.push({ id: p.id, path: p.path, isNew: false });
    } else if (p.uri) {
      const path = photoPathFor(opts.userId, p.id);
      adoptPhoto(p.uri, path);
      photos.push({ id: p.id, path, isNew: true });
    }
  }
  const kept = new Set(photos.map((p) => p.path));
  const removed = opts.previousPhotos.filter((p) => !kept.has(p.path));
  const cover = photos[0]?.path ?? null;

  // What the server gets (Postgres types).
  const serverData: Record<string, unknown> = {
    ...Object.fromEntries(COLUMNS.map((c) => [c, opts.input[c] ?? null])),
    user_id: opts.userId,
    photo_path: cover,
  };
  const photoRow = (p: { id: string; path: string }, position: number) => ({
    catch_id: id, user_id: opts.userId, path: p.path, position,
  });

  await writeLocal(
    async (txn) => {
      const values = toLocal(opts.input);
      if (isNew) {
        await txn.runAsync(
          `INSERT INTO catches (id, user_id, ${COLUMNS.join(', ')}, photo_path, created_at, updated_at)
           VALUES (?, ?, ${COLUMNS.map(() => '?').join(', ')}, ?, ?, ?)`,
          [id, opts.userId, ...values, cover, now, now],
        );
      } else {
        await txn.runAsync(
          `UPDATE catches SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}, photo_path = ?, updated_at = ? WHERE id = ?`,
          [...values, cover, now, id],
        );
      }
      for (const [i, p] of photos.entries()) {
        await txn.runAsync(
          `INSERT OR REPLACE INTO catch_photos (id, catch_id, user_id, path, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, coalesce((SELECT created_at FROM catch_photos WHERE id = ?), ?), ?)`,
          [p.id, id, opts.userId, p.path, i, p.id, now, now],
        );
        if (p.isNew) await txn.runAsync(queueSql, [p.path, 'upload']);
      }
      for (const p of removed) {
        await txn.runAsync('DELETE FROM catch_photos WHERE id = ?', [p.id]);
        await txn.runAsync(queueSql, [p.path, 'delete']);
      }
    },
    [
      // The catch first: photo rows reference it.
      isNew ? { tbl: 'catches', op: 'upsert', id, data: serverData } : { tbl: 'catches', op: 'update', id, data: serverData },
      // Upserts (not updates) so a cover that never had a photo row gets one.
      ...photos.map((p, i) => ({ tbl: 'catch_photos', op: 'upsert' as const, id: p.id, data: photoRow(p, i) })),
      ...removed.map((p) => ({
        tbl: 'catch_photos', op: 'upsert' as const, id: p.id, data: { ...photoRow(p, 0), deleted_at: now },
      })),
    ],
  );
  for (const p of removed) deleteLocalPhoto(p.path);
  return id;
}

/** Soft delete (a tombstone, so your other devices remove it too), with its photos. */
export async function deleteCatch(id: string) {
  const row = await db.getFirstAsync<{ photo_path: string | null }>('SELECT photo_path FROM catches WHERE id = ?', [id]);
  const rows = await db.getAllAsync<{ id: string; path: string }>('SELECT id, path FROM catch_photos WHERE catch_id = ?', [id]);
  const paths = new Set([...rows.map((r) => r.path), ...(row?.photo_path ? [row.photo_path] : [])]);
  const now = new Date().toISOString();
  await writeLocal(
    async (txn) => {
      await txn.runAsync('DELETE FROM catch_photos WHERE catch_id = ?', [id]);
      await txn.runAsync('DELETE FROM catches WHERE id = ?', [id]);
      for (const path of paths) await txn.runAsync(queueSql, [path, 'delete']);
    },
    [
      // Photo tombstones before the catch's: they need the catch still visible to pass RLS.
      ...rows.map((r) => ({ tbl: 'catch_photos', op: 'update' as const, id: r.id, data: { deleted_at: now } })),
      { tbl: 'catches', op: 'update', id, data: { deleted_at: now } },
    ],
  );
  for (const path of paths) deleteLocalPhoto(path);
}
