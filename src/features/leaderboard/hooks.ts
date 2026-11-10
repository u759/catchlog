import { useInfiniteQuery } from '@tanstack/react-query';

import { PHOTO_BUCKET, supabase } from '@/lib/supabase';

// The leaderboard reads other anglers' catches, so it isn't synced to the device; it's an online,
// paginated query (cached for offline viewing of what was last loaded).

export type LeaderboardPeriod = 'month' | 'year' | 'all';
const PAGE_SIZE = 25;

function since(period: LeaderboardPeriod): string | undefined {
  const now = new Date();
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1).toISOString();
  return undefined;
}

export function useLeaderboard(period: LeaderboardPeriod) {
  return useInfiniteQuery({
    queryKey: ['leaderboard', period],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('leaderboard', {
        p_since: since(period),
        p_limit: PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      const paths = data.map((r) => r.photo_path).filter(Boolean);
      const { data: urls } = paths.length
        ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60)
        : { data: [] };
      const byPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
      return data.map((r) => ({ ...r, photo_url: r.photo_path ? (byPath.get(r.photo_path) ?? null) : null }));
    },
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined),
  });
}
