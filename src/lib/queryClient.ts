import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import {
  type Catch,
  catchKeys,
  saveCatchRemote,
  type SaveCatchVars,
  softDeleteCatch,
} from '@/features/catches/api';

const WEEK = 1000 * 60 * 60 * 24 * 7;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: WEEK, staleTime: 30_000, retry: 2 },
    mutations: { gcTime: WEEK },
  },
});

// Persist the cache (so the logbook opens with no signal) and any *paused* mutations
// (so catches logged offline survive an app restart and sync later).
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'catchlog-cache' });
export const persistMaxAge = WEEK;

// Tell React Query when we're offline so mutations pause instead of failing.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)),
);

// Refetch when the app returns to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

// ── Offline queue ───────────────────────────────────────────────────────────
// Mutation functions must be registered by key (not inline) so that paused mutations
// restored from storage after a restart know how to run.
export const MUTATION_SAVE_CATCH = ['catches', 'save'] as const;
export const MUTATION_DELETE_CATCH = ['catches', 'delete'] as const;

function patchMine(userId: string, fn: (rows: Catch[]) => Catch[]) {
  queryClient.setQueryData<Catch[]>(catchKeys.mine(userId), (rows) => fn(rows ?? []));
}

queryClient.setMutationDefaults(MUTATION_SAVE_CATCH, {
  mutationFn: (vars: SaveCatchVars) => saveCatchRemote(vars),
  retry: 5,
  onMutate: async ({ row, speciesName }: SaveCatchVars) => {
    await queryClient.cancelQueries({ queryKey: catchKeys.all });
    patchMine(row.user_id, (rows) => {
      const existing = rows.find((r) => r.id === row.id);
      const optimistic = {
        ...existing,
        ...row,
        species: speciesName ? { common_name: speciesName } : (existing?.species ?? null),
        _pending: true,
      } as Catch;
      queryClient.setQueryData(catchKeys.detail(row.id), optimistic);
      const rest = rows.filter((r) => r.id !== row.id);
      return [optimistic, ...rest].sort((a, b) => b.caught_at.localeCompare(a.caught_at));
    });
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: catchKeys.all }),
});

queryClient.setMutationDefaults(MUTATION_DELETE_CATCH, {
  mutationFn: ({ id }: { id: string; userId: string }) => softDeleteCatch(id),
  retry: 5,
  onMutate: async ({ id, userId }: { id: string; userId: string }) => {
    await queryClient.cancelQueries({ queryKey: catchKeys.mine(userId) });
    patchMine(userId, (rows) => rows.filter((r) => r.id !== id));
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: catchKeys.all }),
});
