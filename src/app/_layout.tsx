import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth';
import { persister, persistMaxAge, queryClient } from '@/lib/queryClient';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: persistMaxAge }}>
      <AuthProvider>
        <StatusBar style="dark" />
        {/* Every Reanimated animation follows the phone's Reduce Motion setting. */}
        <ReducedMotionConfig mode={ReduceMotion.System} />
        <RootNavigator />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="catch/[id]" />
        <Stack.Screen name="catch/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="species/[id]" />
        <Stack.Screen name="lake/[id]" />
        <Stack.Screen name="gear/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="spot/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="credits" />
        <Stack.Screen name="offline-areas" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
