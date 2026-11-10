import * as Crypto from 'expo-crypto';

import { useUserId } from '@/features/catches/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { writeLocal } from '@/lib/sync/engine';

export type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  depth_m: number | null;
  notes: string | null;
  waterbody_id: string | null;
};

export function useSpots() {
  const userId = useUserId() ?? '';
  return useLiveQuery<Spot>('SELECT * FROM spots WHERE user_id = ? ORDER BY name', [userId], ['spots']).data;
}

export function useSpot(id: string | undefined) {
  const { data } = useLiveQuery<Spot>('SELECT * FROM spots WHERE id = ?', [id ?? ''], ['spots']);
  return data[0] ?? null;
}

export async function saveSpot(userId: string, input: Omit<Spot, 'id'>, id?: string) {
  const spotId = id ?? Crypto.randomUUID();
  const now = new Date().toISOString();
  const data = { user_id: userId, name: input.name, lat: input.lat, lng: input.lng, depth_m: input.depth_m,
    notes: input.notes, waterbody_id: input.waterbody_id };
  await writeLocal(
    async (tx) => {
      await tx.runAsync(
        `INSERT INTO spots (id, user_id, name, lat, lng, depth_m, notes, waterbody_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, lat = excluded.lat, lng = excluded.lng,
           depth_m = excluded.depth_m, notes = excluded.notes, waterbody_id = excluded.waterbody_id, updated_at = excluded.updated_at`,
        [spotId, userId, input.name, input.lat, input.lng, input.depth_m, input.notes, input.waterbody_id, now, now],
      );
    },
    [id ? { tbl: 'spots', op: 'update', id: spotId, data } : { tbl: 'spots', op: 'upsert', id: spotId, data }],
  );
  return spotId;
}

export async function deleteSpot(id: string) {
  await writeLocal(
    async (tx) => {
      await tx.runAsync('DELETE FROM spots WHERE id = ?', [id]);
    },
    [{ tbl: 'spots', op: 'update', id, data: { deleted_at: new Date().toISOString() } }],
  );
}

/** Great-circle distance (m) and initial bearing (deg) from a to b. */
export function distanceBearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const rad = (d: number) => (d * Math.PI) / 180;
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δφ = rad(b.lat - a.lat), Δλ = rad(b.lng - a.lng);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distance = 2 * R * Math.asin(Math.sqrt(h));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { distance, bearing };
}
