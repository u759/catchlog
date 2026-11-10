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
