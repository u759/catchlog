import { useQuery } from '@tanstack/react-query';

// Open-Meteo: free, no API key, so the app can call it directly (no backend needed).
// https://open-meteo.com/en/docs
export type Weather = {
  temp_c: number;
  wind_kph: number;
  wind_dir_deg: number;
  pressure_hpa: number;
  weather_code: number;
};

export async function fetchCurrentWeather(lat: number, lng: number): Promise<Weather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=kmh';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const c = json?.current;
    if (!c) return null;
    return {
      temp_c: c.temperature_2m,
      wind_kph: c.wind_speed_10m,
      wind_dir_deg: c.wind_direction_10m,
      pressure_hpa: c.surface_pressure,
      weather_code: c.weather_code,
    };
  } catch {
    return null; // offline at the lake: just skip conditions
  }
}

/** Weather right now at a place (lake page). Online; `data` is null without signal. */
export function useCurrentWeather(lat: number | null | undefined, lng: number | null | undefined) {
  return useQuery({
    queryKey: ['weather-now', lat?.toFixed(2), lng?.toFixed(2)],
    queryFn: () => fetchCurrentWeather(lat!, lng!),
    enabled: lat != null && lng != null,
    staleTime: 15 * 60_000,
  });
}

/**
 * Weather for a past moment (the catch's time, not "now"): Open-Meteo hourly data, the forecast API for the last
 * ~3 months and the historical archive before that. Returns the hour that contains `at`.
 */
export async function fetchWeatherAt(lat: number, lng: number, at: Date): Promise<Weather | null> {
  const day = at.toISOString().slice(0, 10);
  const recent = Date.now() - at.getTime() < 85 * 86_400_000;
  const host = recent ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
  const url =
    `${host}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${day}&end_date=${day}&timezone=GMT` +
    '&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=kmh';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const h = (await res.json())?.hourly;
    const i = (h?.time as string[] | undefined)?.indexOf(`${day}T${String(at.getUTCHours()).padStart(2, '0')}:00`) ?? -1;
    if (i < 0 || h.temperature_2m[i] == null) return null;
    return {
      temp_c: h.temperature_2m[i],
      wind_kph: h.wind_speed_10m[i],
      wind_dir_deg: h.wind_direction_10m[i],
      pressure_hpa: h.surface_pressure[i],
      weather_code: h.weather_code[i],
    };
  } catch {
    return null;
  }
}

// WMO weather interpretation codes -> short label
const WMO: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};
export const weatherLabel = (code: number) => WMO[code] ?? 'Unknown';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: number) => DIRS[Math.round(deg / 45) % 8];

export function formatTemp(c: number, units: 'imperial' | 'metric') {
  return units === 'imperial' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`;
}

export function formatWind(kph: number, deg: number, units: 'imperial' | 'metric') {
  const speed = units === 'imperial' ? `${Math.round(kph / 1.609)} mph` : `${Math.round(kph)} km/h`;
  return `${speed} ${compass(deg)}`;
}

export function isWeather(x: unknown): x is Weather {
  return !!x && typeof x === 'object' && 'temp_c' in x && 'weather_code' in x;
}
