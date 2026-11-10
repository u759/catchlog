// Refreshes reference data (lakes, depths, depth maps, species-per-lake, species summaries/photos) from public sources.
// Invoked every 10 minutes by pg_cron (see migration *_sync_sources_cron.sql) with a shared secret.
// Each invocation works on due sources page by page within a time budget; progress is saved in
// public.data_sources.state so long refreshes continue on the next invocation.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { bcAdapters } from './adapters/bc.ts';
import { wikiSpecies } from './adapters/wiki.ts';
import type { Adapter, AdapterState } from './adapters/types.ts';

const ADAPTERS: Record<string, Adapter> = Object.fromEntries([...bcAdapters, wikiSpecies].map((a) => [a.key, a]));
const TIME_BUDGET_MS = 100_000; // stay well under the 150 s wall-clock limit
const LOCK_STALE_MS = 5 * 60_000;

type SourceRow = {
  key: string;
  enabled: boolean;
  refresh_every: string;
  depends_on: string[];
  state: AdapterState;
  running_since: string | null;
  last_success_at: string | null;
};

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const started = Date.now();
  const log: unknown[] = [];

  const { data: sources, error } = await db.from('data_sources').select('*').eq('enabled', true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const byKey = new Map((sources as SourceRow[]).map((s) => [s.key, s]));
  const inProgress = (s: SourceRow) => Object.keys(s.state ?? {}).length > 0;
  const due = (s: SourceRow) => {
    if (!ADAPTERS[s.key]) return false;
    if (s.depends_on.some((d) => !byKey.get(d)?.last_success_at)) return false;
    if (inProgress(s) || !s.last_success_at) return true;
    return Date.now() - Date.parse(s.last_success_at) > intervalMs(s.refresh_every);
  };
  // In-progress runs first, then never-run, then oldest.
  const queue = (sources as SourceRow[])
    .filter(due)
    .sort((a, b) => Number(inProgress(b)) - Number(inProgress(a)) ||
      (a.last_success_at ? Date.parse(a.last_success_at) : 0) - (b.last_success_at ? Date.parse(b.last_success_at) : 0));

  for (const source of queue) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    // Claim the source (another invocation may be working on it).
    const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
    const { data: claimed } = await db
      .from('data_sources')
      .update({ running_since: new Date().toISOString(), last_attempt_at: new Date().toISOString() })
      .eq('key', source.key)
      .or(`running_since.is.null,running_since.lt.${staleBefore}`)
      .select('key');
    if (!claimed?.length) continue;

    const adapter = ADAPTERS[source.key];
    let state: AdapterState = source.state ?? {};
    let rows = 0;
    try {
      for (;;) {
        const r = await adapter.step(db, state);
        rows += r.rows;
        state = r.state;
        if (r.done) {
          await db.from('data_sources').update({
            state: {}, running_since: null, last_success_at: new Date().toISOString(), last_error: null,
            last_row_count: rows,
          }).eq('key', source.key);
          log.push({ source: source.key, done: true, rows });
          byKey.set(source.key, { ...source, last_success_at: new Date().toISOString(), state: {} });
          break;
        }
        await db.from('data_sources').update({ state }).eq('key', source.key); // checkpoint each page
        if (Date.now() - started > TIME_BUDGET_MS) {
          await db.from('data_sources').update({ running_since: null }).eq('key', source.key);
          log.push({ source: source.key, done: false, at: state.after ?? state.start ?? null });
          break;
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from('data_sources').update({ running_since: null, last_error: message.slice(0, 1000), state })
        .eq('key', source.key);
      log.push({ source: source.key, error: message });
    }
  }
  return Response.json({ ms: Date.now() - started, log });
});

/** Postgres interval text ("30 days", "180 days", "01:00:00") → ms. */
function intervalMs(text: string): number {
  const days = /(\d+)\s+day/.exec(text)?.[1];
  const hms = /(\d+):(\d+):(\d+)/.exec(text);
  return (Number(days ?? 0) * 86400 + (hms ? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) : 0)) * 1000;
}
