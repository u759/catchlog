// "Water now" on the lake page: the latest real-time reading from a gauge on the lake (Water Survey of Canada).
// Online only (TanStack Query); which gauges sit on which lake is synced reference data (`lake_stations`).
import { useQuery } from '@tanstack/react-query';

import { useLiveQuery } from '@/lib/sync/db';

export type LakeGauge = { station_number: string; name: string };

export function useLakeGauges(waterbodyId: string | null | undefined) {
  return useLiveQuery<LakeGauge>(
    'SELECT station_number, name FROM lake_stations WHERE waterbody_id = ? ORDER BY station_number',
    [waterbodyId ?? ''],
    ['lake_stations'],
  ).data;
}

export type Reading = { value: number; at: Date; dayAgo: number | null };
export type WaterNow = { station: string; temp_c: Reading | null; level_m: Reading | null; flow_m3s: Reading | null };

const PARAMS = { temp_c: '5', level_m: '46', flow_m3s: '47' } as const;
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', '%20');

/** Latest values over the last 26 hours, each with the reading ~24 hours earlier (for "since yesterday"). */
export async function fetchWaterNow(station: LakeGauge): Promise<WaterNow> {
  const end = new Date();
  const start = new Date(+end - 26 * 3_600_000);
  const url = 'https://wateroffice.ec.gc.ca/services/real_time_data/csv/inline?' +
    `stations[]=${station.station_number}&parameters[]=5&parameters[]=46&parameters[]=47&start_date=${fmt(start)}&end_date=${fmt(end)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Water Survey ${res.status}`);
  const lines = (await res.text()).split('\n').slice(1);
  const series: Record<string, { t: number; v: number }[]> = {};
  for (const line of lines) {
    const [, date, param, value] = line.split(',');
    const v = Number(value);
    if (!date || !Number.isFinite(v)) continue;
    (series[param] ??= []).push({ t: Date.parse(date), v });
  }
  const reading = (param: string): Reading | null => {
    const s = series[param];
    if (!s?.length) return null;
    const last = s.reduce((a, b) => (b.t > a.t ? b : a));
    const target = last.t - 24 * 3_600_000;
    const before = s.reduce((a, b) => (Math.abs(b.t - target) < Math.abs(a.t - target) ? b : a));
    return { value: last.v, at: new Date(last.t), dayAgo: Math.abs(before.t - target) < 2 * 3_600_000 ? before.v : null };
  };
  return {
    station: station.name,
    temp_c: reading(PARAMS.temp_c),
    level_m: reading(PARAMS.level_m),
    flow_m3s: reading(PARAMS.flow_m3s),
  };
}

export function useWaterNow(station: LakeGauge | undefined) {
  return useQuery({
    queryKey: ['water-now', station?.station_number],
    queryFn: () => fetchWaterNow(station!),
    enabled: !!station,
    staleTime: 15 * 60_000,
    retry: 1,
  });
}
