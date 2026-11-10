// Refreshes one reference-data source per request (lakes, depths, species-per-lake, FishBase, Wikipedia...).
// pg_cron runs private.dispatch_sync_sources() every minute; it calls this function once per due source
// with { source: key } and a shared secret, so sources run independently and in parallel.
// Each request works for up to TIME_BUDGET_MS and checkpoints progress in public.data_sources.state;
// the next minute's dispatch continues where it stopped.
//
// Adapters: one file per region (adapters/bc.ts, later adapters/ab.ts ...) plus region-agnostic sources
// (adapters/fishbase.ts, adapters/wiki.ts). Register them in ADAPTERS and add a data_sources row.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { bcAdapters } from './adapters/bc.ts';
import { fishbase } from './adapters/fishbase.ts';
import type { Adapter, AdapterState } from './adapters/types.ts';
import { wikiSpecies } from './adapters/wiki.ts';

const ADAPTERS: Record<string, Adapter> = Object.fromEntries(
  [...bcAdapters, fishbase, wikiSpecies].map((a) => [a.key, a]),
);
const TIME_BUDGET_MS = 100_000; // well under the 150 s wall-clock limit
const LOCK_STALE_MS = 5 * 60_000; // keep in sync with private.dispatch_sync_sources()

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { source: key } = (await req.json().catch(() => ({}))) as { source?: string };
  const adapter = key ? ADAPTERS[key] : undefined;
  if (!key || !adapter) return Response.json({ error: `unknown source ${key}` }, { status: 400 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const started = Date.now();

  // Claim the source; another request may already be working on it.
  const now = new Date().toISOString();
  const { data: claimed, error } = await db
    .from('data_sources')
    .update({ running_since: now, last_attempt_at: now })
    .eq('key', key)
    .eq('enabled', true)
    .or(`running_since.is.null,running_since.lt.${new Date(Date.now() - LOCK_STALE_MS).toISOString()}`)
    .select('state, version');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!claimed?.length) return Response.json({ source: key, skipped: 'running' });

  let state = (claimed[0].state ?? {}) as AdapterState;
  const version = (claimed[0].version ?? null) as string | null;
  const update = (fields: Record<string, unknown>) => db.from('data_sources').update(fields).eq('key', key);
  let rows = 0;
  try {
    for (;;) {
      const r = await adapter.step(db, state, { version });
      rows += r.rows;
      state = r.state;
      if (r.done) {
        await update({
          state: {}, running_since: null, last_success_at: new Date().toISOString(), last_error: null,
          last_row_count: rows, version: r.version ?? version,
        });
        return Response.json({ source: key, done: true, rows, ms: Date.now() - started });
      }
      if (r.yield || Date.now() - started > TIME_BUDGET_MS) {
        await update({ state, running_since: null, last_error: null });
        return Response.json({ source: key, done: false, ms: Date.now() - started });
      }
      await update({ state, last_error: null }); // checkpoint each step
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await update({ running_since: null, last_error: message.slice(0, 1000), state });
    return Response.json({ source: key, error: message }, { status: 500 });
  }
});
