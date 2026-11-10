import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { MUTATION_DELETE_CATCH, MUTATION_SAVE_CATCH } from '@/lib/queryClient';

import { type Catch, catchKeys, fetchCatch, fetchMyCatches, fetchSpecies, type SaveCatchVars } from './api';

export function useUserId() {
  return useAuth().session?.user.id ?? null;
}

export function useMyCatches() {
  const userId = useUserId();
  return useQuery({
    queryKey: catchKeys.mine(userId ?? 'none'),
    queryFn: () => fetchMyCatches(userId!),
    enabled: !!userId,
  });
}

/** Looks in the logbook cache first (works offline / for unsynced catches), then the server. */
export function useCatch(id: string | undefined) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: catchKeys.detail(id ?? 'none'),
    queryFn: () => fetchCatch(id!),
    enabled: !!id,
    initialData: () =>
      qc.getQueryData<Catch[]>(catchKeys.mine(userId ?? 'none'))?.find((c) => c.id === id),
  });
}

export function useSpecies() {
  return useQuery({ queryKey: ['species'], queryFn: fetchSpecies, staleTime: 1000 * 60 * 60 * 24 });
}

export function useSaveCatch() {
  return useMutation<void, Error, SaveCatchVars>({ mutationKey: MUTATION_SAVE_CATCH });
}

export function useDeleteCatch() {
  return useMutation<void, Error, { id: string; userId: string }>({ mutationKey: MUTATION_DELETE_CATCH });
}
