import { getMoonIllumination, getMoonTimes, getTimes } from 'suncalc';

// Sun, moon and solunar periods computed on the device (works offline). Solunar (John Alden
// Knight): major periods ~2 h centred on the moon's upper/lower transit, minor periods ~1 h
// centred on moonrise/moonset.

const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous',
  'Last quarter', 'Waning crescent'] as const;

export function moonPhaseName(phase: number) {
  return PHASES[Math.round(phase * 8) % 8];
}

export type Period = { kind: 'major' | 'minor'; start: Date; end: Date };

export function solunarPeriods(date: Date, lat: number, lng: number): Period[] {
  const m = getMoonTimes(date, lat, lng);
  const around = (t: Date | undefined, minutes: number, kind: Period['kind']): Period[] =>
    t ? [{ kind, start: new Date(t.getTime() - minutes * 60_000), end: new Date(t.getTime() + minutes * 60_000) }] : [];
  return [
    ...around(m.transit, 60, 'major'),
    ...around(m.lowerTransit, 60, 'major'),
    ...around(m.rise, 30, 'minor'),
    ...around(m.set, 30, 'minor'),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type Astro = {
  moonPhase: string;
  moonIllumination: number; // 0..1
  sunrise: Date | null;
  sunset: Date | null;
  periods: Period[];
  inPeriod: Period | null; // the solunar period `date` falls in, if any
};

export function astroAt(date: Date, lat: number, lng: number): Astro {
  const moon = getMoonIllumination(date);
  const sun = getTimes(date, lat, lng);
  const periods = solunarPeriods(date, lat, lng);
  const t = date.getTime();
  return {
    moonPhase: moonPhaseName(moon.phase),
    moonIllumination: moon.fraction,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    periods,
    inPeriod: periods.find((p) => t >= p.start.getTime() && t <= p.end.getTime()) ?? null,
  };
}

export const fmtTime = (d: Date | null | undefined) =>
  d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
