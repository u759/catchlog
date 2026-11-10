import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Gauge,
  type LucideIcon,
  Moon,
  Ruler,
  Sun,
  Sunrise,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react-native';
import type { ReactElement } from 'react';

import { FishMark } from '@/components/FishMark';
import { Row } from '@/components/ui';
import { type Astro, fmtTime } from '@/features/astro/astro';
import type { Gauge as GaugeReading, Tide } from '@/features/conditions/model';
import { parseTs } from '@/features/catches/model';
import { formatTemp, formatWind, type Weather, weatherLabel } from '@/features/weather/openMeteo';
import { formatFlow, formatLevel, formatTideHeight, type Units } from '@/utils/units';

/** An icon for a WMO weather code. */
export function weatherIcon(code: number): LucideIcon {
  if (code <= 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 95) return CloudLightning;
  if (code >= 61) return CloudRain;
  return Cloud;
}

export type ConditionInput = {
  weather?: Weather | null;
  tide?: Tide | null;
  /** Gauge readings; `extra` adds a subtitle per value (e.g. "+4 cm since yesterday"). */
  gauge?: (Partial<Pick<GaugeReading, 'temp_c' | 'level_m' | 'flow_m3s'>> & { station?: string; levelSub?: string | null }) | null;
  seaTempC?: number | null;
  astro?: Astro | null;
  /** 'catch': solunar for the catch moment ("Caught in a major feeding period"); 'now': today's periods. */
  when: 'catch' | 'now';
  /** Name the gauge under its last row (catch screen). The lake page names it in a caption instead. */
  gaugeLabel?: boolean;
};

/**
 * The conditions rows shared by the catch screen and the lake page, in one order, each with its icon. Returns an
 * array of Rows to put in a Group; a row appears only when its value exists.
 */
export function conditionRows(c: ConditionInput, units: Units): ReactElement[] {
  const rows: ReactElement[] = [];
  const { weather: w, tide, gauge: g, astro } = c;
  if (w) {
    rows.push(<Row key="weather" icon={weatherIcon(w.weather_code)} label="Weather" value={`${formatTemp(w.temp_c, units)}, ${weatherLabel(w.weather_code)}`} />);
    rows.push(<Row key="wind" icon={Wind} label="Wind" value={formatWind(w.wind_kph, w.wind_dir_deg, units)} />);
    rows.push(<Row key="pressure" icon={Gauge} label="Air pressure" value={`${Math.round(w.pressure_hpa)} hPa`} />);
  }
  if (tide) {
    rows.push(
      <Row
        key="tide"
        icon={Waves}
        label="Tide"
        value={`${tide.trend === 'rising' ? 'Rising' : 'Falling'}, ${formatTideHeight(tide.height_m, units)}`}
        sub={[
          tide.next &&
            `${tide.next.kind === 'high' ? 'High' : 'Low'} ${formatTideHeight(tide.next.height_m, units)} at ${fmtTime(parseTs(tide.next.at))}`,
          tide.station,
        ]
          .filter(Boolean)
          .join(' · ')}
      />,
    );
  }
  if (g) {
    const gaugeRows: { key: string; icon: LucideIcon; label: string; value: string; sub?: string | null }[] = [];
    if (g.temp_c != null) gaugeRows.push({ key: 'wtemp', icon: Thermometer, label: 'Water temperature', value: formatTemp(g.temp_c, units) });
    if (g.level_m != null) gaugeRows.push({ key: 'level', icon: Ruler, label: 'Water level', value: formatLevel(g.level_m, units), sub: g.levelSub });
    if (g.flow_m3s != null) gaugeRows.push({ key: 'flow', icon: Droplets, label: 'Flow', value: formatFlow(g.flow_m3s, units) });
    gaugeRows.forEach((r, i) => {
      const last = i === gaugeRows.length - 1;
      const sub = [r.sub, last && c.gaugeLabel && g.station ? `Gauge: ${g.station}` : null].filter(Boolean).join(' · ');
      rows.push(<Row key={r.key} icon={r.icon} label={r.label} value={r.value} sub={sub || null} />);
    });
  }
  if (c.seaTempC != null) {
    rows.push(<Row key="sea" icon={Thermometer} label="Sea temperature" value={formatTemp(c.seaTempC, units)} sub="Satellite, daily average" />);
  }
  if (astro) {
    rows.push(<Row key="moon" icon={Moon} label="Moon" value={`${astro.moonPhase}, ${Math.round(astro.moonIllumination * 100)}%`} />);
    rows.push(<Row key="sun" icon={Sunrise} label="Sunrise – sunset" value={`${fmtTime(astro.sunrise)} – ${fmtTime(astro.sunset)}`} />);
    const p = astro.inPeriod;
    const list = astro.periods.map((x) => `${x.kind} ${fmtTime(x.start)}`).join(', ') || 'No periods this day';
    rows.push(
      <Row
        key="solunar"
        icon={FishMark}
        label="Solunar"
        numberOfLines={2}
        sub={
          p
            ? c.when === 'catch'
              ? `Caught in a ${p.kind} feeding period (${fmtTime(p.start)}–${fmtTime(p.end)})`
              : `In a ${p.kind} feeding period now, until ${fmtTime(p.end)}`
            : c.when === 'now'
              ? `Today: ${list}`
              : list
        }
      />,
    );
  }
  return rows;
}
