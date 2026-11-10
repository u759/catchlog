import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * A data source adapter refreshes one row of public.data_sources.
 * The runner calls `step` repeatedly (across as many invocations as needed) until it returns done.
 * Each step must be small (one page of a remote API, one file) to stay within the Edge Function limits
 * (2 s CPU, 150 s wall clock per request); anything it needs to resume goes in `state`.
 */
export type AdapterState = Record<string, unknown> & { run?: string };

export type StepContext = {
  /** data_sources.version: the release loaded by the last successful run. */
  version: string | null;
};

export type StepResult = {
  state: AdapterState;
  done: boolean;
  rows: number;
  /** Release loaded by this run (stored in data_sources.version when done). */
  version?: string;
  /** End this invocation after the step (CPU-heavy steps); the next one continues within a minute. */
  yield?: boolean;
};

export type Adapter = {
  key: string;
  step: (db: SupabaseClient, state: AdapterState, ctx: StepContext) => Promise<StepResult>;
};

export const USER_AGENT = 'CatchLog/1.0 (non-commercial hobby app; github.com/u759/catchlog)';

export async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  const host = new URL(url).host;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    let wait = 1000 * 2 ** i;
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) } });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`${host} ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
      const retryAfter = Number(res.headers.get('Retry-After'));
      if (retryAfter > 0) wait = Math.min(retryAfter, 30) * 1000;
      await res.body?.cancel();
      last = new Error(`${host} HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, wait));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function rpc<T = number>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Our species that have a FishBase ID: [{ id, fishbase_id }]. */
export async function speciesWithFishbase(db: SupabaseClient): Promise<{ id: string; fishbase_id: number }[]> {
  const out: { id: string; fishbase_id: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('species').select('id, fishbase_id').not('fishbase_id', 'is', null)
      .order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as { id: string; fishbase_id: number }[]));
    if (data.length < 1000) return out;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', deg: '°', micro: 'µ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', times: '×', plusmn: '±',
};

/** Text cleanup for source text: entities, tags, FishBase "(Ref. 123)" citations, whitespace, length. */
export function clean(text: unknown, limit?: number): string | null {
  if (text == null) return null;
  let t = String(text)
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1].toLowerCase() === 'x' ? 2 : 1), e[1].toLowerCase() === 'x' ? 16 : 10))
        : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, '')
    .replace(/\s*\(Ref\.?\s*[\d,\s]+\)/g, '');
  if (limit && t.includes('Ref')) t = t.replace(/\s*\[[^\]]*\]/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (limit && t.length > limit) {
    const cut = t.slice(0, limit);
    const dot = cut.lastIndexOf('. ');
    t = dot > limit * 0.5 ? cut.slice(0, dot + 1) : cut.trimEnd() + '…';
  }
  return t;
}

/**
 * "FRANÇOIS LAKE" → "François Lake". Capitalises letters after a space, hyphen, slash or bracket only, so accented
 * and non-Latin letters inside a word (ç, ŝ) don't start a new word.
 */
export function titleCase(s: string): string;
export function titleCase(s: string | null | undefined): string | null;
export function titleCase(s: string | null | undefined) {
  return s ? s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()) : null;
}
