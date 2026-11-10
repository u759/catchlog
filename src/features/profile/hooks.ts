import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/catches/hooks';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { Units } from '@/utils/units';

export type Profile = Tables<'profiles'>;

export function useProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUnits(): Units {
  return useProfile().data?.units === 'metric' ? 'metric' : 'imperial';
}

export function useSetUnits() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (units: Units) => {
      const { error } = await supabase.from('profiles').update({ units }).eq('id', userId!);
      if (error) throw error;
    },
    onMutate: (units) =>
      qc.setQueryData<Profile>(['profile', userId], (p) => (p ? { ...p, units } : p)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}

// ── friends ────────────────────────────────────────────────────────────────
type MiniProfile = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
export type Friendship = {
  other: MiniProfile;
  status: 'pending' | 'accepted';
  incoming: boolean; // they asked me
};

export function useFriends() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['friends', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Friendship[]> => {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          'requester_id, addressee_id, status,' +
            ' requester:profiles!friendships_requester_id_fkey(id, display_name, avatar_url),' +
            ' addressee:profiles!friendships_addressee_id_fkey(id, display_name, avatar_url)',
        )
        .returns<
          {
            requester_id: string;
            addressee_id: string;
            status: string;
            requester: MiniProfile;
            addressee: MiniProfile;
          }[]
        >();
      if (error) throw error;
      return data.map((f) => {
        const incoming = f.addressee_id === userId;
        return {
          other: incoming ? f.requester : f.addressee,
          status: f.status === 'accepted' ? 'accepted' : 'pending',
          incoming,
        };
      });
    },
  });
}

/** Send a request by friend code. If they already asked you, this accepts instead. */
export function useAddFriend() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<string> => {
      const { data: other, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('friend_code', code.trim().toUpperCase())
        .maybeSingle();
      if (error) throw error;
      if (!other) throw new Error('No angler found with that code.');
      if (other.id === userId) throw new Error("That's your own code.");

      const { data: accepted } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('requester_id', other.id)
        .eq('addressee_id', userId!)
        .select();
      if (accepted?.length) return `You and ${other.display_name ?? 'them'} are now friends.`;

      const { error: insertError } = await supabase
        .from('friendships')
        .insert({ requester_id: userId!, addressee_id: other.id });
      if (insertError?.code === '23505') throw new Error('Request already sent.');
      if (insertError) throw insertError;
      return `Request sent to ${other.display_name ?? 'them'}.`;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends', userId] }),
  });
}

export function useAcceptFriend() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherId: string) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('requester_id', otherId)
        .eq('addressee_id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends', userId] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}
