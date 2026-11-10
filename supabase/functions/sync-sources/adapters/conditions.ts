// Conditions at catch time, Canada-wide: station lists (tides, water gauges) and the per-catch lookup.
// Everything is looked up by the catch's own time (caught_at) and position, never the upload time.
import { parse as parseCsv } from 'jsr:@std/csv@1';

import { type Adapter, fetchWithRetry, rpc, titleCase } from './types.ts';

const IWLS = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';

/** CHS tide stations with predictions (IWLS). Monthly. */
export const chsTideStations: Adapter = {
  key: 'chs-tides',
  async step(db) {
    type S = { id: string; code: string; officialName: string; latitude: number; longitude: number; timeSeries?: { code: string }[] };
    const stations = (await (await fetchWithRetry(`${IWLS}/stations`)).json()) as S[];
    const rows = stations
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        id: s.id, code: s.code, name: s.officialName, lat: s.latitude, lng: s.longitude,
        wlp: !!s.timeSeries?.some((t) => t.code === 'wlp'), hilo: !!s.timeSeries?.some((t) => t.code === 'wlp-hilo'),
      }));
    const n = await rpc(db, 'replace_tide_stations', { p_rows: rows });
    return { state: {}, done: true, rows: n };
  },
};

/** ECCC real-time hydrometric stations (and which lakes they sit on). Monthly. */
export const ecccWaterStations: Adapter = {
  key: 'eccc-hydrometric',
  async step(db) {
    const rows: { station_number: string; name: string; lat: number; lng: number }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const url = 'https://api.weather.gc.ca/collections/hydrometric-stations/items?STATUS_EN=Active&REAL_TIME=1&f=json' +
        `&properties=STATION_NUMBER,STATION_NAME&limit=1000&offset=${offset}`;
      type F = { geometry: { coordinates: [number, number] }; properties: { STATION_NUMBER: string; STATION_NAME: string } };
      const page = (await (await fetchWithRetry(url)).json()) as { features: F[] };
      for (const f of page.features) {
        rows.push({
          station_number: f.properties.STATION_NUMBER,
          name: titleCase(f.properties.STATION_NAME).replace(/\bAt\b/g, 'at'),
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        });
      }
      if (page.features.length < 1000) break;
    }
    const n = await rpc(db, 'replace_water_stations', { p_rows: rows });
    return { state: {}, done: true, rows: n };
  },
};


type Pending = {
  id: string; caught_at: string; lat: number; lng: number; area_ha: number | null;
  tide_station: string | null; tide_name: string | null; water_station: string | null; water_name: string | null;
};
type Conditions = Record<string, unknown> & { pending?: string[] };

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const DAY = 86_400_000;

/** Tide height, rising/falling and the next high or low at the catch's time (CHS predictions; any date). */
export async function tideAt(station: string, name: string, at: Date) {
  type P = { eventDate: string; value: number };
  const near = (await (await fetchWithRetry(
    `${IWLS}/stations/${station}/data?time-series-code=wlp&from=${iso(new Date(at.getTime() - 10 * 60_000))}&to=${iso(new Date(at.getTime() + 20 * 60_000))}`,
  )).json()) as P[];
  if (!near.length) return null;
  const closest = near.reduce((a, b) => (Math.abs(Date.parse(b.eventDate) - +at) < Math.abs(Date.parse(a.eventDate) - +at) ? b : a));
  const later = near[near.length - 1];
  const hilo = (await (await fetchWithRetry(
    `${IWLS}/stations/${station}/data?time-series-code=wlp-hilo&from=${iso(new Date(at.getTime() - 13 * 3_600_000))}&to=${iso(new Date(at.getTime() + 13 * 3_600_000))}`,
  )).json()) as P[];
  const i = hilo.findIndex((h) => Date.parse(h.eventDate) > +at);
  const next = i >= 0 ? hilo[i] : null;
  const prev = i > 0 ? hilo[i - 1] : i < 0 && hilo.length ? hilo[hilo.length - 1] : null;
  return {
    station: name,
    height_m: Math.round(closest.value * 100) / 100,
    trend: later.value >= closest.value ? 'rising' : 'falling',
    next: next ? { kind: prev ? (next.value > prev.value ? 'high' : 'low') : later.value >= closest.value ? 'high' : 'low', at: next.eventDate,
      height_m: Math.round(next.value * 100) / 100 } : null,
  };
}

/** Water temperature, level and flow from a real-time gauge (Water Survey of Canada keeps 30 days). */
export async function gaugeAt(station: string, name: string, at: Date) {
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', '%20');
  const url = 'https://wateroffice.ec.gc.ca/services/real_time_data/csv/inline?' +
    `stations[]=${station}&parameters[]=5&parameters[]=46&parameters[]=47&start_date=${fmt(new Date(+at - 3_600_000))}&end_date=${fmt(new Date(+at + 3_600_000))}`;
  const text = (await (await fetchWithRetry(url)).text()).replace(/^﻿/, '');
  const rows = parseCsv(text, { skipFirstRow: true }) as Record<string, string>[];
  const pick = (param: string) => {
    let best: { v: number; d: number } | null = null;
    for (const r of rows) {
      const p = r['Parameter/Paramètre']?.trim();
      const v = Number(r['Value/Valeur']);
      if (p !== param || !Number.isFinite(v)) continue;
      const d = Math.abs(Date.parse(r.Date) - +at);
      if (!best || d < best.d) best = { v, d };
    }
    return best ? Math.round(best.v * 100) / 100 : null;
  };
  const temp = pick('5'), level = pick('46'), flow = pick('47');
  if (temp == null && level == null && flow == null) return null;
  return { station: name, temp_c: temp, level_m: level, flow_m3s: flow };
}

/** Satellite sea surface temperature (JPL MUR, ~1 km, daily, 1–4 days late). MUR masks inland lakes (NaN),
 * so this only applies to catches on the sea. */
export async function murAt(lat: number, lng: number, at: Date): Promise<number | null | 'later'> {
  if (Date.now() - +at < 4 * DAY) return 'later';
  const day = at.toISOString().slice(0, 10);
  const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.csv?analysed_sst%5B(${day}T09:00:00Z)%5D%5B(${lat.toFixed(3)})%5D%5B(${lng.toFixed(3)})%5D`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  const last = (await res.text()).trim().split('\n').pop() ?? '';
  const v = Number(last.split(',')[3]);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

/** Fills catches.conditions for catches that need them (a few per run; runs every 5 minutes). */
export const catchConditions: Adapter = {
  key: 'catch-conditions',
  async step(db) {
    const pending = await rpc<Pending[]>(db, 'pending_catch_conditions', { p_limit: 8 });
    for (const c of pending) {
      const at = new Date(c.caught_at);
      const out: Conditions = {};
      const later: string[] = [];
      try {
        if (c.tide_station) {
          const tide = await tideAt(c.tide_station, c.tide_name ?? '', at);
          if (tide) out.tide = tide;
        }
        if (c.water_station && Date.now() - +at < 30 * DAY) {
          const water = await gaugeAt(c.water_station, c.water_name ?? '', at);
          if (water) out.water = water;
        }
        const hasTemp = (out.water as { temp_c?: number | null } | undefined)?.temp_c != null;
        if (!hasTemp && c.tide_station) {
          // Near a tide station and not in a lake: sea surface temperature (NaN on land/rivers → nothing).
          const t = await murAt(c.lat, c.lng, at);
          if (t === 'later') later.push('sea_temp');
          else if (t != null) out.sea_temp = { temp_c: t, source: 'satellite' };
        }
      } catch (e) {
        // A source failed (rate limit, outage): try this catch again in 12 hours.
        later.push('retry');
        console.warn('conditions', c.id, e instanceof Error ? e.message : e);
      }
      if (later.length) out.pending = later;
      await rpc(db, 'set_catch_conditions', { p_id: c.id, p_conditions: out });
    }
    return { state: {}, done: true, rows: pending.length };
  },
};
