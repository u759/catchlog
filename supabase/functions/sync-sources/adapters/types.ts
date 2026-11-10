import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * A data source adapter refreshes one entry in public.data_sources.
 * The runner calls `step` repeatedly (possibly across several invocations) until it returns done.
 * Each step must be small (one page of a remote API) to stay within Edge Function CPU limits;
 * anything it needs to resume goes in `state` (persisted in data_sources.state).
 */
export type AdapterState = Record<string, unknown> & { run?: string };

export type StepResult = { state: AdapterState; done: boolean; rows: number };

export type Adapter = {
  key: string;
  step: (db: SupabaseClient, state: AdapterState) => Promise<StepResult>;
};

export const USER_AGENT = 'CatchLog/1.0 (non-commercial hobby app; github.com/u759/catchlog)';

export async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) } });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function rpc<T = number>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
