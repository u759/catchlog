import * as Crypto from 'expo-crypto';

import { useUserId } from '@/features/catches/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { writeLocal } from '@/lib/sync/engine';

export type Gear = {
  id: string;
  category: string;
  subtype: string | null;
  brand: string | null;
  name: string;
  color: string | null;
  size: string | null;
  weight_g: number | null;
  hook_size: string | null;
  quantity: number | null;
  notes: string | null;
};
export type GearWithStats = Gear & { catches: number; species: string | null; last_used: string | null };

/** Your tackle with how many fish each item has caught. */
export function useGearList() {
  const userId = useUserId() ?? '';
  return useLiveQuery<GearWithStats>(
    `SELECT g.*, count(c.id) AS catches, max(c.caught_at) AS last_used,
            group_concat(DISTINCT coalesce(s.common_name, c.species_other)) AS species
     FROM gear g
     LEFT JOIN catches c ON c.gear_id = g.id AND c.user_id = g.user_id
     LEFT JOIN species s ON s.id = c.species_id
     WHERE g.user_id = ?
     GROUP BY g.id
     ORDER BY catches DESC, g.name`,
    [userId],
    ['gear', 'catches', 'species'],
  );
}

export function useGear(id: string | undefined) {
  const { data } = useLiveQuery<Gear>('SELECT * FROM gear WHERE id = ?', [id ?? ''], ['gear']);
  return data[0] ?? null;
}

const FIELDS = ['category', 'subtype', 'brand', 'name', 'color', 'size', 'weight_g', 'hook_size', 'quantity', 'notes'] as const;
export type GearInput = Omit<Gear, 'id'>;

export async function saveGear(userId: string, input: GearInput, id?: string) {
  const gearId = id ?? Crypto.randomUUID();
  const now = new Date().toISOString();
  const values = FIELDS.map((f) => input[f] ?? null);
  const data = { ...Object.fromEntries(FIELDS.map((f) => [f, input[f] ?? null])), user_id: userId };
  await writeLocal(
    async (tx) => {
      if (id) {
        await tx.runAsync(`UPDATE gear SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          [...values, now, gearId]);
      } else {
        await tx.runAsync(
          `INSERT INTO gear (id, user_id, ${FIELDS.join(', ')}, created_at, updated_at)
           VALUES (?, ?, ${FIELDS.map(() => '?').join(', ')}, ?, ?)`,
          [gearId, userId, ...values, now, now],
        );
      }
    },
    [id ? { tbl: 'gear', op: 'update', id: gearId, data } : { tbl: 'gear', op: 'upsert', id: gearId, data }],
  );
  return gearId;
}

export async function deleteGear(id: string) {
  await writeLocal(
    async (tx) => {
      await tx.runAsync('DELETE FROM gear WHERE id = ?', [id]);
    },
    [{ tbl: 'gear', op: 'update', id, data: { deleted_at: new Date().toISOString() } }],
  );
}
