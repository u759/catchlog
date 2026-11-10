import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import type { SQLiteBindValue } from 'expo-sqlite';

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
 *        Reference tables (species, profiles, waterbodies, species-per-lake): explicit version check
 *        (reference_version RPC); nothing downloads unless it changed.
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

type Row = Record<string, unknown> & { id: string; updated_at: string; deleted_at?: string | null };

/**
 * Pulls a user-owned table incrementally (rows changed since the cursor, minus a small overlap),
 * applies tombstones as local deletes, and skips rows that still have unsent local changes.
 */
async function pullOwned(
  table: 'catches' | 'gear' | 'spots',
  userId: string,
  columns: string[],
  toLocal: (r: Row) => SQLiteBindValue[],
  afterPage?: (rows: Row[], skip: Set<string>) => Promise<void>,
) {
  const key = `cursor:${table}`;
  const from = since(await getState(key));
  const skip = await pendingIds(table);
  let maxSeen: string | null = null;
  const placeholders = columns.map(() => '?').join(', ');

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', from)
      .order('updated_at')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data as unknown as Row[];

    await transaction(async (txn) => {
      for (const r of rows) {
        if (!maxSeen || r.updated_at > maxSeen) maxSeen = r.updated_at;
        if (skip.has(r.id)) continue;
        if (r.deleted_at) {
          await txn.runAsync(`DELETE FROM ${table} WHERE id = ?`, [r.id]);
          continue;
        }
        await txn.runAsync(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, toLocal(r));
      }
    });
    if (afterPage) await afterPage(rows, skip);
    if (rows.length < PAGE) break;
  }
  if (maxSeen) await setState(key, maxSeen);
}

const CATCH_COLUMNS = [
  'id', 'user_id', 'species_id', 'species_other', 'length_mm', 'weight_g', 'weight_estimated', 'caught_at', 'lat', 'lng',
  'place_name', 'waterbody', 'lure', 'line_lb', 'notes', 'weather', 'photo_path', 'released', 'visibility', 'gear_id',
  'waterbody_id', 'created_at', 'updated_at',
];

const pullCatches = (userId: string) =>
  pullOwned(
    'catches',
    userId,
    CATCH_COLUMNS,
    (r) =>
      CATCH_COLUMNS.map((c) => {
        const v = r[c];
        if (c === 'weather') return v ? JSON.stringify(v) : null;
        if (c === 'weight_estimated' || c === 'released') return b(v);
        return (v ?? null) as SQLiteBindValue;
      }),
    async (rows, skip) => {
      // Deleted catches: drop their local photo. Missing photos: queue a download (offline viewing).
      for (const r of rows) {
        const path = r.photo_path as string | null;
        if (!path || skip.has(r.id)) continue;
        if (r.deleted_at) deleteLocalPhoto(path);
        else if (!localPhotoFile(path).exists) await queuePhoto(path, 'download');
      }
    },
  );

const GEAR_COLUMNS = ['id', 'user_id', 'category', 'subtype', 'brand', 'name', 'color', 'size', 'weight_g', 'hook_size',
  'quantity', 'notes', 'created_at', 'updated_at'];
const SPOT_COLUMNS = ['id', 'user_id', 'name', 'lat', 'lng', 'depth_m', 'notes', 'waterbody_id', 'created_at', 'updated_at'];
const plain = (cols: string[]) => (r: Row) => cols.map((c) => (r[c] ?? null) as SQLiteBindValue);

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
 * Reference tables (admin-managed, read-only for users) use an explicit version check:
 * 1. reference_version(table) = "count:latest updated_at". Same as ours → nothing to download.
 * 2. Otherwise: if the row count changed (rows added/removed) or we have nothing, reload everything
 *    (dropping local rows the server no longer has); else fetch only rows updated after our cursor.
 */
type RefTable = {
  table: 'species' | 'species_profiles' | 'waterbodies' | 'waterbody_species';
  select: string;
  order: string[]; // stable keyset: updated_at + primary key column(s)
  pk: string[];
  columns: string[]; // local columns, in insert order
  toLocal: (r: Row) => SQLiteBindValue[];
};

async function pullReference(t: RefTable) {
  const { data: version, error: versionError } = await supabase.rpc('reference_version', { p_table: t.table });
  if (versionError) throw versionError;
  if (version && version === (await getState(`ref:${t.table}:version`))) return;

  const serverCount = Number(String(version).split(':')[0]);
  const local = await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${t.table}`);
  const cursor = await getState(`ref:${t.table}:cursor`);
  const fullReload = !cursor || serverCount !== local?.n;

  let maxSeen: string | null = cursor;
  const seen = new Set<string>();
  const placeholders = t.columns.map(() => '?').join(', ');
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from(t.table).select(t.select);
    if (!fullReload) q = q.gt('updated_at', cursor!);
    for (const col of t.order) q = q.order(col);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data as unknown as Row[];
    await transaction(async (txn) => {
      for (const r of rows) {
        seen.add(t.pk.map((k) => String(r[k])).join('|'));
        if (!maxSeen || r.updated_at > maxSeen) maxSeen = r.updated_at;
        await txn.runAsync(`INSERT OR REPLACE INTO ${t.table} (${t.columns.join(', ')}) VALUES (${placeholders})`, t.toLocal(r));
      }
    });
    if (rows.length < PAGE) break;
  }
  if (fullReload) {
    const keyExpr = t.pk.join(" || '|' || ");
    const localKeys = await db.getAllAsync<{ k: string }>(`SELECT ${keyExpr} AS k FROM ${t.table}`);
    const gone = localKeys.filter((r) => !seen.has(r.k)).map((r) => r.k);
    if (gone.length) {
      await transaction(async (txn) => {
        for (const k of gone) await txn.runAsync(`DELETE FROM ${t.table} WHERE ${keyExpr} = ?`, [k]);
      });
    }
  }
  if (maxSeen) await setState(`ref:${t.table}:cursor`, maxSeen);
  await setState(`ref:${t.table}:version`, version);
}

const json = (v: unknown) => (v == null ? null : JSON.stringify(v));
const nb = (v: unknown) => (v == null ? null : b(v));

const REFERENCE: RefTable[] = [
  {
    table: 'species',
    select: 'id, common_name, common_name_fr, scientific_name, family, order_name, dex_no, game_fish, in_canada, regions, lw_a, lw_b, max_length_mm, freshwater, saltwater, updated_at',
    order: ['updated_at', 'id'],
    pk: ['id'],
    columns: ['id', 'common_name', 'common_name_fr', 'scientific_name', 'family', 'order_name', 'dex_no', 'game_fish',
      'in_canada', 'regions', 'lw_a', 'lw_b', 'max_length_mm', 'freshwater', 'saltwater', 'updated_at'],
    toLocal: (s) => [s.id, s.common_name, s.common_name_fr, s.scientific_name, s.family, s.order_name, s.dex_no,
      b(s.game_fish), b(s.in_canada), JSON.stringify(s.regions ?? []), s.lw_a, s.lw_b, s.max_length_mm,
      nb(s.freshwater), nb(s.saltwater), s.updated_at] as SQLiteBindValue[],
  },
  {
    table: 'species_profiles',
    select: 'species_id, summary, summary_url, habitat, environment, migration, depth_min_m, depth_max_m, temp_pref_min_c, temp_pref_max_c, spawning_months, feeding, diet, id_features, max_weight_g, longevity_years, iucn_status, canada_status, canada_notes, image_url, image_thumb_url, image_author, image_license, image_page_url, updated_at',
    order: ['updated_at', 'species_id'],
    pk: ['species_id'],
    columns: ['species_id', 'summary', 'summary_url', 'habitat', 'environment', 'migration', 'depth_min_m', 'depth_max_m',
      'temp_pref_min_c', 'temp_pref_max_c', 'spawning_months', 'feeding', 'diet', 'id_features', 'max_weight_g',
      'longevity_years', 'iucn_status', 'canada_status', 'canada_notes', 'image_url', 'image_thumb_url', 'image_author',
      'image_license', 'image_page_url', 'updated_at'],
    toLocal: (p) => [p.species_id, p.summary, p.summary_url, p.habitat, p.environment, p.migration, p.depth_min_m,
      p.depth_max_m, p.temp_pref_min_c, p.temp_pref_max_c, json(p.spawning_months), p.feeding, p.diet, p.id_features,
      p.max_weight_g, p.longevity_years, p.iucn_status, p.canada_status, p.canada_notes, p.image_url, p.image_thumb_url,
      p.image_author, p.image_license, p.image_page_url, p.updated_at] as SQLiteBindValue[],
  },
  {
    table: 'waterbodies',
    select: 'id, region, kind, name, area_ha, max_depth_m, mean_depth_m, depth_maps, lat, lng, bbox, updated_at',
    order: ['updated_at', 'id'],
    pk: ['id'],
    columns: ['id', 'region', 'kind', 'name', 'area_ha', 'max_depth_m', 'mean_depth_m', 'depth_maps', 'lat', 'lng',
      'west', 'south', 'east', 'north', 'updated_at'],
    toLocal: (w) => {
      const bb = (w.bbox as number[] | null) ?? [null, null, null, null];
      return [w.id, w.region, w.kind, w.name, w.area_ha, w.max_depth_m, w.mean_depth_m, json(w.depth_maps ?? []),
        w.lat, w.lng, bb[0], bb[1], bb[2], bb[3], w.updated_at] as SQLiteBindValue[];
    },
  },
  {
    table: 'waterbody_species',
    select: 'waterbody_id, species_id, source, observations, first_observed, last_observed, updated_at',
    order: ['updated_at', 'waterbody_id', 'species_id', 'source'],
    pk: ['waterbody_id', 'species_id', 'source'],
    columns: ['waterbody_id', 'species_id', 'source', 'observations', 'first_observed', 'last_observed', 'updated_at'],
    toLocal: (r) => [r.waterbody_id, r.species_id, r.source, r.observations, r.first_observed, r.last_observed,
      r.updated_at] as SQLiteBindValue[],
  },
];

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
    await pullOwned('gear', userId, GEAR_COLUMNS, plain(GEAR_COLUMNS));
    await pullOwned('spots', userId, SPOT_COLUMNS, plain(SPOT_COLUMNS));
    await pullProfile();
    await pullFriendships(userId);
    for (const t of REFERENCE) await pullReference(t);
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
