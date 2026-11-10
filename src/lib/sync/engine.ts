import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

import { db, getState, initDb, setState, transaction, type Tx, wipeLocalData, write } from './db';
import { deleteAllLocalPhotos, deleteLocalPhoto, localPhotoFile, processPhotoQueue, queuePhoto } from './photos';

/*
 * Offline-first sync between local SQLite and Supabase, without extra services.
 *
 *  push  Local writes are recorded in `outbox` in the same transaction as the local change, then sent
 *        in order through supabase-js (RLS + grants apply). Network/5xx errors stop the run and retry
 *        later; permanent rejections (22xxx/23xxx/42501) are dropped and the row is re-pulled.
 *  pull  Per table, fetch rows with updated_at >= cursor - overlap, ordered by (updated_at, id), in pages.
 *        updated_at is stamped by the server, and the 60s overlap catches transactions that committed
 *        out of order. Rows with unsent local changes are skipped so they aren't overwritten.
 *        Deletes travel as tombstones (catches.deleted_at). Friendships are small: full refresh.
 *        Species: explicit version check (species_version RPC); nothing downloads unless it changed.
 *  photos  Queued transfers in photo_queue (see photos.ts).
 *
 * Runs on sign-in, app foreground, reconnect, after local writes (debounced), every 5 min, and on
 * pull-to-refresh. Single-flight: overlapping requests are coalesced into one follow-up run.
 */

const PAGE = 500;
const OVERLAP_MS = 60_000;
const FATAL = [/^22...$/, /^23...$/, /^42501$/];

// ── status store (for the UI) ───────────────────────────────────────────────
export type SyncStatus = {
  online: boolean;
  syncing: boolean;
  pending: number; // unsent local changes + photo uploads
  hasSynced: boolean; // completed at least one full pull on this device
  lastSyncedAt: string | null;
  error: string | null;
};

let status: SyncStatus = { online: true, syncing: false, pending: 0, hasSynced: false, lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );

async function refreshPending() {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT count(*) FROM outbox) + (SELECT count(*) FROM photo_queue WHERE action = 'upload') AS n`,
  );
  setStatus({ pending: row?.n ?? 0 });
}

// ── local writes ────────────────────────────────────────────────────────────
export type OutboxOp =
  | { tbl: string; op: 'upsert'; id: string; data: Record<string, unknown> }
  | { tbl: string; op: 'update'; id: string; data: Record<string, unknown> }
  | { tbl: string; op: 'delete'; id: string };

/** Applies a local change and queues it for upload atomically, then schedules a sync. */
export async function writeLocal(apply: (txn: Tx) => Promise<void>, ops: OutboxOp[]) {
  await initDb();
  const now = new Date().toISOString();
  await transaction(async (txn) => {
    await apply(txn);
    for (const o of ops) {
      await txn.runAsync('INSERT INTO outbox (tbl, op, row_id, data, created_at) VALUES (?, ?, ?, ?, ?)', [
        o.tbl,
        o.op,
        o.id,
        'data' in o ? JSON.stringify(o.data) : null,
        now,
      ]);
    }
  });
  await refreshPending();
  requestSync(800);
}

// ── push ────────────────────────────────────────────────────────────────────
type OutboxRow = { seq: number; tbl: string; op: string; row_id: string; data: string | null };

async function push() {
  for (;;) {
    const o = await db.getFirstAsync<OutboxRow>('SELECT seq, tbl, op, row_id, data FROM outbox ORDER BY seq LIMIT 1');
    if (!o) return;
    const data = o.data ? (JSON.parse(o.data) as Record<string, unknown>) : {};
    const table = supabase.from(o.tbl as never) as ReturnType<typeof supabase.from>;
    const { error } =
      o.op === 'upsert'
        ? await table.upsert({ ...data, id: o.row_id } as never)
        : o.op === 'update'
          ? await table.update(data as never).eq('id', o.row_id)
          : await table.delete().eq('id', o.row_id);

    if (!error) {
      await write('DELETE FROM outbox WHERE seq = ?', [o.seq]);
      continue;
    }
    if (error.code && FATAL.some((re) => re.test(error.code))) {
      // The server will never accept this; drop it and re-pull so local matches the server again.
      console.warn('[sync] dropping rejected change', o.tbl, o.op, error.code, error.message);
      await write('DELETE FROM outbox WHERE seq = ?', [o.seq]);
      await setState(`cursor:${o.tbl}`, null);
      continue;
    }
    await write('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?', [error.message, o.seq]);
    throw new Error(error.message); // transient (network/5xx): stop and retry on the next run
  }
}

// ── pull ────────────────────────────────────────────────────────────────────
async function pendingIds(tbl: string) {
  const rows = await db.getAllAsync<{ row_id: string }>('SELECT DISTINCT row_id FROM outbox WHERE tbl = ?', [tbl]);
  return new Set(rows.map((r) => r.row_id));
}

const since = (cursor: string | null) =>
  cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';

const b = (v: unknown) => (v ? 1 : 0);

async function pullCatches(userId: string) {
  const key = 'cursor:catches';
  const from = since(await getState(key));
  const skip = await pendingIds('catches');
  let maxSeen: string | null = null;

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('catches')
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', from)
      .order('updated_at')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;

    await transaction(async (txn) => {
      for (const r of data) {
        if (!maxSeen || r.updated_at > maxSeen) maxSeen = r.updated_at;
        if (skip.has(r.id)) continue;
        if (r.deleted_at) {
          await txn.runAsync('DELETE FROM catches WHERE id = ?', [r.id]);
          continue;
        }
        await txn.runAsync(
          `INSERT OR REPLACE INTO catches (id, user_id, species_id, species_other, length_mm, weight_g, weight_estimated,
             caught_at, lat, lng, place_name, waterbody, lure, line_lb, notes, weather, photo_path, released, visibility,
             created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            r.id, r.user_id, r.species_id, r.species_other, r.length_mm, r.weight_g, b(r.weight_estimated),
            r.caught_at, r.lat, r.lng, r.place_name, r.waterbody, r.lure, r.line_lb, r.notes,
            r.weather ? JSON.stringify(r.weather) : null, r.photo_path, b(r.released), r.visibility,
            r.created_at, r.updated_at,
          ],
        );
      }
    });

    // Deleted catches: drop their local photo. Missing photos: queue a download.
    for (const r of data) {
      if (!r.photo_path || skip.has(r.id)) continue;
      if (r.deleted_at) deleteLocalPhoto(r.photo_path);
      else if (!localPhotoFile(r.photo_path).exists) await queuePhoto(r.photo_path, 'download');
    }
    if (data.length < PAGE) break;
  }
  if (maxSeen) await setState(key, maxSeen);
}

async function pullProfile() {
  if ((await pendingIds('profiles')).size > 0) return;
  const { data, error } = await supabase.rpc('my_profile');
  if (error) throw error;
  if (!data) return;
  await write(
    'INSERT OR REPLACE INTO profiles (id, display_name, avatar_url, units, friend_code) VALUES (?, ?, ?, ?, ?)',
    [data.id, data.display_name, data.avatar_url, data.units, data.friend_code],
  );
}

type FriendRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  requester: { id: string; display_name: string | null; avatar_url: string | null } | null;
  addressee: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

async function pullFriendships(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      'id, requester_id, addressee_id, status, created_at,' +
        ' requester:profiles!friendships_requester_id_fkey(id, display_name, avatar_url),' +
        ' addressee:profiles!friendships_addressee_id_fkey(id, display_name, avatar_url)',
    )
    .returns<FriendRow[]>();
  if (error) throw error;
  const skip = await pendingIds('friendships');

  await transaction(async (txn) => {
    // Full refresh (small table) handles unfriending/declines from the other side.
    const keep = [...skip];
    await txn.runAsync(
      `DELETE FROM friendships WHERE id NOT IN (${keep.map(() => '?').join(',') || "''"})`,
      keep,
    );
    for (const f of data) {
      if (skip.has(f.id)) continue;
      await txn.runAsync(
        'INSERT OR REPLACE INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [f.id, f.requester_id, f.addressee_id, f.status, f.created_at],
      );
      const other = f.requester_id === userId ? f.addressee : f.requester;
      if (other) {
        await txn.runAsync(
          `INSERT INTO profiles (id, display_name, avatar_url) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url`,
          [other.id, other.display_name, other.avatar_url],
        );
      }
    }
  });
}

/**
 * Species is admin-managed reference data, so it uses an explicit version check:
 * 1. Ask the server for its version ("count:latest updated_at"). Same as ours → done (one tiny request).
 * 2. Otherwise: if the row count changed (added/removed species) or we have nothing, reload everything;
 *    else fetch only rows updated after our cursor (no overlap needed: only migrations write species).
 */
async function pullSpecies() {
  const { data: version, error: versionError } = await supabase.rpc('species_version');
  if (versionError) throw versionError;
  if (version && version === (await getState('species:version'))) return;

  const serverCount = Number(String(version).split(':')[0]);
  const local = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM species');
  const cursor = await getState('cursor:species');
  const fullReload = !cursor || serverCount !== local?.n;

  let maxSeen: string | null = cursor;
  const seen = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('species')
      .select('id, common_name, common_name_fr, scientific_name, family, game_fish, in_canada, regions, lw_a, lw_b, max_length_mm, freshwater, saltwater, updated_at');
    if (!fullReload) q = q.gt('updated_at', cursor!);
    const { data, error } = await q.order('updated_at').order('id').range(offset, offset + PAGE - 1);
    if (error) throw error;
    await transaction(async (txn) => {
      for (const s of data) {
        seen.add(s.id);
        if (!maxSeen || s.updated_at > maxSeen) maxSeen = s.updated_at;
        await txn.runAsync(
          `INSERT OR REPLACE INTO species (id, common_name, common_name_fr, scientific_name, family, game_fish, in_canada,
             regions, lw_a, lw_b, max_length_mm, freshwater, saltwater, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id, s.common_name, s.common_name_fr, s.scientific_name, s.family, b(s.game_fish), b(s.in_canada),
            JSON.stringify(s.regions ?? []), s.lw_a, s.lw_b, s.max_length_mm,
            s.freshwater == null ? null : b(s.freshwater), s.saltwater == null ? null : b(s.saltwater), s.updated_at,
          ],
        );
      }
    });
    if (data.length < PAGE) break;
  }
  if (fullReload && seen.size > 0) {
    // Drop species that no longer exist on the server.
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM species');
    for (const { id } of rows) if (!seen.has(id)) await write('DELETE FROM species WHERE id = ?', [id]);
  }
  if (maxSeen) await setState('cursor:species', maxSeen);
  await setState('species:version', version);
}

// ── scheduling ──────────────────────────────────────────────────────────────
let userId: string | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let unsubscribers: (() => void)[] = [];

async function runOnce() {
  if (!userId || !status.online) return;
  setStatus({ syncing: true });
  try {
    await push();
    // Sequential: each pull writes in its own exclusive transaction.
    await pullCatches(userId);
    await pullProfile();
    await pullFriendships(userId);
    await pullSpecies();
    // Drain due photo transfers (failed ones back off and wait for a later run).
    for (let i = 0; i < 20 && status.online; i++) {
      if ((await processPhotoQueue()) === 0) break;
    }
    const now = new Date().toISOString();
    await setState('has_synced', '1');
    await setState('last_synced_at', now);
    setStatus({ hasSynced: true, lastSyncedAt: now, error: null });
  } catch (e) {
    setStatus({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    await refreshPending();
    setStatus({ syncing: false });
  }
}

/** Requests a sync soon. Safe to call often; runs are single-flight and coalesced. */
export function requestSync(delayMs = 0) {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (running) {
      rerun = true;
      return;
    }
    running = (async () => {
      do {
        rerun = false;
        await runOnce();
      } while (rerun);
    })().finally(() => {
      running = null;
    });
  }, delayMs);
}

/** Starts background sync for a signed-in user. */
export async function startSync(uid: string) {
  if (userId === uid) return;
  userId = uid;
  await initDb();
  setStatus({
    hasSynced: (await getState('has_synced')) === '1',
    lastSyncedAt: await getState('last_synced_at'),
  });
  await refreshPending();

  unsubscribers.push(
    NetInfo.addEventListener((s) => {
      const online = !!s.isConnected && s.isInternetReachable !== false;
      const cameOnline = online && !status.online;
      setStatus({ online });
      if (cameOnline) requestSync();
    }),
  );
  const appState = AppState.addEventListener('change', (s) => s === 'active' && requestSync());
  unsubscribers.push(() => appState.remove());
  interval = setInterval(() => requestSync(), 5 * 60 * 1000);
  requestSync();
}

/** Stops syncing and wipes this device's local copy (sign-out). Unsent changes are lost. */
export async function stopSyncAndWipe() {
  userId = null;
  clearTimeout(debounce);
  clearInterval(interval);
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  await running?.catch(() => {});
  await wipeLocalData();
  deleteAllLocalPhotos();
  setStatus({ syncing: false, pending: 0, hasSynced: false, lastSyncedAt: null, error: null });
}
