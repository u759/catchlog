// Conditions at catch time, filled on the server by the `catch-conditions` adapter after the catch uploads
// (tide: CHS predictions; water: ECCC real-time gauge; sea_temp: NASA JPL MUR). Read-only on the phone.
export type Tide = {
  station: string;
  height_m: number;
  trend: 'rising' | 'falling';
  next: { kind: 'high' | 'low'; at: string; height_m: number } | null;
};
export type Gauge = { station: string; temp_c: number | null; level_m: number | null; flow_m3s: number | null };
export type CatchConditions = {
  tide?: Tide;
  water?: Gauge;
  sea_temp?: { temp_c: number; source: 'satellite' };
  pending?: string[];
};

/** JSON text (local SQLite) or an object (server row) → conditions, or null when there's nothing to show. */
export function parseConditions(v: unknown): CatchConditions | null {
  let o = v;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const c = o as CatchConditions;
  return c.tide || c.water || c.sea_temp ? c : null;
}
