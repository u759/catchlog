import { addDatabaseChangeListener, openDatabaseSync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

// The app's local database. Screens read from here (works offline); src/lib/sync/engine.ts keeps it
// in step with Supabase. Booleans are 0/1, jsonb/arrays are JSON text.

export const db = openDatabaseSync('catchlog.db', { enableChangeListener: true });

// All writes go through one connection, one at a time. App saves and background sync never race
// (no "database is locked"), and nothing interleaves into another write's transaction.
// Never call write()/transaction() from inside a transaction callback: use the `tx` passed in.
let chain: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
export type Tx = SQLiteDatabase;
export const transaction = (fn: (tx: Tx) => Promise<void>) =>
  withWriteLock(() => db.withTransactionAsync(() => fn(db)));
export const write = (sql: string, params: SQLiteBindValue[] = []) => withWriteLock(() => db.runAsync(sql, params));

const MIGRATIONS: string[] = [
  `
  CREATE TABLE catches (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, species_id TEXT, species_other TEXT,
    length_mm INTEGER, weight_g INTEGER, weight_estimated INTEGER NOT NULL DEFAULT 0, caught_at TEXT NOT NULL,
    lat REAL, lng REAL, place_name TEXT, waterbody TEXT, lure TEXT, line_lb REAL, notes TEXT, weather TEXT,
    photo_path TEXT, released INTEGER NOT NULL DEFAULT 1, visibility TEXT NOT NULL DEFAULT 'friends',
    created_at TEXT, updated_at TEXT, deleted_at TEXT
  );
  CREATE INDEX catches_user_date ON catches (user_id, caught_at);
  CREATE INDEX catches_user_length ON catches (user_id, length_mm);

  CREATE TABLE profiles (
    id TEXT PRIMARY KEY NOT NULL, display_name TEXT, avatar_url TEXT, units TEXT, friend_code TEXT
  );

  CREATE TABLE friendships (
    id TEXT PRIMARY KEY NOT NULL, requester_id TEXT NOT NULL, addressee_id TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT
  );

  CREATE TABLE species (
    id TEXT PRIMARY KEY NOT NULL, common_name TEXT NOT NULL, common_name_fr TEXT, scientific_name TEXT,
    family TEXT, game_fish INTEGER NOT NULL DEFAULT 0, in_canada INTEGER NOT NULL DEFAULT 0, regions TEXT,
    lw_a REAL, lw_b REAL, max_length_mm INTEGER, freshwater INTEGER, saltwater INTEGER, updated_at TEXT
  );

  -- Local writes waiting to be sent to Supabase, in order.
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, op TEXT NOT NULL, row_id TEXT NOT NULL,
    data TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX outbox_row ON outbox (tbl, row_id);

  -- Photo transfers (upload / download / delete), retried with backoff.
  CREATE TABLE photo_queue (
    path TEXT PRIMARY KEY NOT NULL, action TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT, next_try_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `,
];

let ready: Promise<void> | null = null;

/** Applies schema migrations once (PRAGMA user_version tracks progress). */
export function initDb() {
  ready ??= (async () => {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let version = row?.user_version ?? 0;
    while (version < MIGRATIONS.length) {
      const sql = MIGRATIONS[version];
      const next = version + 1;
      await transaction(async (tx) => {
        await tx.execAsync(sql);
        await tx.execAsync(`PRAGMA user_version = ${next}`);
      });
      version += 1;
    }
  })();
  return ready;
}

export type Params = SQLiteBindValue[];

/**
 * Runs a query and re-runs it whenever one of `tables` changes (SQLite update hook).
 * Pass every table the query reads from.
 */
export function useLiveQuery<T>(sql: string, params: Params, tables: string[]) {
  const [state, setState] = useState<{ data: T[]; isLoading: boolean }>({ data: [], isLoading: true });
  const paramsKey = JSON.stringify(params);
  const tablesKey = tables.join(',');

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      await initDb();
      const rows = await db.getAllAsync<T>(sql, JSON.parse(paramsKey) as Params);
      if (alive) setState({ data: rows, isLoading: false });
    };
    run().catch((e) => console.warn('[db] query failed', e));
    const watched = new Set(tablesKey.split(','));
    const sub = addDatabaseChangeListener((e) => {
      if (!watched.has(e.tableName)) return;
      clearTimeout(timer);
      timer = setTimeout(() => run().catch(() => {}), 25); // coalesce bursts (e.g. a sync batch)
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, [sql, paramsKey, tablesKey]);

  return state;
}

export async function getState(key: string) {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setState(key: string, value: string | null) {
  await write('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);
}

/** Wipes all local data (sign-out). DELETE ... WHERE 1 so change listeners fire. */
export async function wipeLocalData() {
  await initDb();
  await transaction(async (tx) => {
    for (const t of ['catches', 'profiles', 'friendships', 'species', 'outbox', 'photo_queue', 'sync_state']) {
      await tx.runAsync(`DELETE FROM ${t} WHERE 1`);
    }
  });
}
