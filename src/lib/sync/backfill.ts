import * as Location from 'expo-location';

import { parseTs } from '@/features/catches/model';
import { fetchWeatherAt } from '@/features/weather/openMeteo';

import { db, getState, setState } from './db';
import type { writeLocal as WriteLocal } from './engine';

/**
 * Catches logged without signal have no weather or place name. Once online, fill them in from the catch's own
 * time and position (never "now"). A few per sync run; each catch is tried at most 3 times.
 */
export async function backfillCatchDetails(userId: string, writeLocal: typeof WriteLocal) {
  const rows = await db.getAllAsync<{ id: string; caught_at: string; lat: number; lng: number; weather: string | null; place_name: string | null }>(
    `SELECT id, caught_at, lat, lng, weather, place_name FROM catches
     WHERE user_id = ? AND deleted_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
       AND (weather IS NULL OR place_name IS NULL)
     ORDER BY julianday(caught_at) DESC LIMIT 10`,
    [userId],
  );
  for (const r of rows) {
    const key = `backfill:${r.id}`;
    const tries = Number((await getState(key)) ?? 0);
    if (tries >= 3) continue;
    await setState(key, String(tries + 1));

    const data: Record<string, unknown> = {};
    if (r.weather == null) {
      const w = await fetchWeatherAt(r.lat, r.lng, parseTs(r.caught_at));
      if (w) data.weather = w;
    }
    if (r.place_name == null) {
      const [place] = await Location.reverseGeocodeAsync({ latitude: r.lat, longitude: r.lng }).catch(() => []);
      const name = place ? [place.city ?? place.subregion, place.region].filter(Boolean).join(', ') : '';
      if (name) data.place_name = name;
    }
    if (!Object.keys(data).length) continue;
    await writeLocal(
      async (tx) => {
        const cols = Object.keys(data);
        await tx.runAsync(
          `UPDATE catches SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          [...cols.map((c) => (c === 'weather' ? JSON.stringify(data[c]) : (data[c] as string))), r.id],
        );
      },
      [{ tbl: 'catches', op: 'update', id: r.id, data }],
    );
  }
}
