import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

// TanStack Query is only for online, server-side reads that aren't synced to the device
// (leaderboard, other anglers' catches) and online-only actions (adding a friend).
// Your own data lives in local SQLite, synced by src/lib/sync.

const DAY = 1000 * 60 * 60 * 24;

export const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: DAY, staleTime: 60_000, retry: 2 } },
});

// Keep the last-loaded leaderboard etc. for offline viewing.
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'catchlog-query-cache' });
export const persistMaxAge = DAY;

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)),
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}
