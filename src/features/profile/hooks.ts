import { useMutation } from '@tanstack/react-query';

import { useUserId } from '@/features/catches/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { writeLocal } from '@/lib/sync/engine';
import { supabase } from '@/lib/supabase';
import type { Units } from '@/utils/units';

// Profiles and friendships are synced into local SQLite (src/lib/sync). Edits are written locally
// and uploaded when online (RLS + column grants still apply server-side). Adding a friend needs the
// server (friend codes are only resolvable there), so that one is online-only.

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  units: string | null;
  friend_code: string | null;
};

export function useProfile() {
  const userId = useUserId() ?? '';
  const { data, isLoading } = useLiveQuery<Profile>(
    'SELECT id, display_name, avatar_url, units, friend_code FROM profiles WHERE id = ?',
    [userId],
    ['profiles'],
  );
  return { data: data[0] ?? null, isLoading };
}

export function useUnits(): Units {
  return useProfile().data?.units === 'metric' ? 'metric' : 'imperial';
}

export async function setUnits(userId: string, units: Units) {
  await writeLocal((txn) => txn.runAsync('UPDATE profiles SET units = ? WHERE id = ?', [units, userId]).then(() => {}), [
    { tbl: 'profiles', op: 'update', id: userId, data: { units } },
  ]);
}

export async function setDisplayName(userId: string, name: string) {
  const display_name = name.trim().slice(0, 40);
  if (!display_name) throw new Error('Name can’t be empty.');
  await writeLocal(
    (txn) => txn.runAsync('UPDATE profiles SET display_name = ? WHERE id = ?', [display_name, userId]).then(() => {}),
    [{ tbl: 'profiles', op: 'update', id: userId, data: { display_name } }],
  );
}

// ── friends ────────────────────────────────────────────────────────────────
export type Friendship = {
  id: string;
  status: 'pending' | 'accepted';
  incoming: boolean; // they asked me
  other: { id: string; display_name: string | null; avatar_url: string | null };
};

export function useFriends() {
  const userId = useUserId() ?? '';
  const { data } = useLiveQuery<{
    id: string;
    status: string;
    requester_id: string;
    other_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>(
    `SELECT f.id, f.status, f.requester_id,
            CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END AS other_id,
            p.display_name, p.avatar_url
     FROM friendships f
     LEFT JOIN profiles p ON p.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.requester_id = ?1 OR f.addressee_id = ?1
     ORDER BY f.status = 'pending' DESC, p.display_name`,
    [userId],
    ['friendships', 'profiles'],
  );
  return data.map(
    (f): Friendship => ({
      id: f.id,
      status: f.status === 'accepted' ? 'accepted' : 'pending',
      incoming: f.requester_id !== userId,
      other: { id: f.other_id, display_name: f.display_name, avatar_url: f.avatar_url },
    }),
  );
}

export const acceptFriend = (friendshipId: string) =>
  writeLocal(
    (txn) => txn.runAsync("UPDATE friendships SET status = 'accepted' WHERE id = ?", [friendshipId]).then(() => {}),
    [{ tbl: 'friendships', op: 'update', id: friendshipId, data: { status: 'accepted' } }],
  );

/** Declines an incoming request, cancels an outgoing one, or unfriends. */
export const removeFriend = (friendshipId: string) =>
  writeLocal((txn) => txn.runAsync('DELETE FROM friendships WHERE id = ?', [friendshipId]).then(() => {}), [
    { tbl: 'friendships', op: 'delete', id: friendshipId },
  ]);

/** Normalises "abcd-efgh" / "ABCD EFGH" to "ABCDEFGH". */
export const cleanFriendCode = (code: string) => code.replace(/[^a-z0-9]/gi, '').toUpperCase();

/** Online-only: resolves the code server-side. The new friendship arrives on the next sync. */
export function useAddFriend() {
  return useMutation({
    networkMode: 'always',
    mutationFn: async (code: string): Promise<string> => {
      const { data, error } = await supabase.rpc('send_friend_request', { p_code: cleanFriendCode(code) });
      if (error) {
        if (/fetch|network/i.test(error.message)) throw new Error('Adding friends needs an internet connection.');
        throw new Error(error.message);
      }
      const { status, display_name } = data as { status: string; display_name: string | null };
      const name = display_name ?? 'them';
      switch (status) {
        case 'accepted':
          return `You and ${name} are now friends.`;
        case 'already_friends':
          return `You and ${name} are already friends.`;
        case 'already_sent':
          return `You already sent ${name} a request.`;
        default:
          return `Request sent to ${name}.`;
      }
    },
  });
}
