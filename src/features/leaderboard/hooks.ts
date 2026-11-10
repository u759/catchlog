import { useQuery } from '@tanstack/react-query';

import { PHOTO_BUCKET, supabase } from '@/lib/supabase';

export type LeaderboardPeriod = 'month' | 'year' | 'all';

function since(period: LeaderboardPeriod): string | undefined {
  const now = new Date();
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1).toISOString();
  return undefined;
}

/** Each visible angler's longest catch (you + friends + public), ranked by length. */
export function useLeaderboard(period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ['leaderboard', period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('leaderboard', { p_since: since(period) });
      if (error) throw error;
      const paths = data.map((r) => r.photo_path).filter(Boolean);
      const { data: urls } = paths.length
        ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60)
        : { data: [] };
      const byPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
      return data.map((r) => ({ ...r, photo_url: r.photo_path ? (byPath.get(r.photo_path) ?? null) : null }));
    },
  });
}
