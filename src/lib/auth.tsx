import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';

import { startSync, stopSyncAndWipe } from './sync/engine';
import { queryClient } from './queryClient';
import { supabase } from './supabase';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const isGoogleConfigured = Boolean(webClientId);

GoogleSignin.configure({
  // The *web* client ID is what Supabase verifies the ID token against.
  webClientId: webClientId || undefined,
  iosClientId: iosClientId || undefined,
});

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Start background sync whenever someone is signed in (works offline from the cached session).
  const userId = state.session?.user.id;
  useEffect(() => {
    if (userId) startSync(userId).catch((e: unknown) => console.warn('[sync] start failed', e));
  }, [userId]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Returns null on success/cancel, or a user-facing error message. */
export async function signInWithGoogle(): Promise<string | null> {
  if (!isGoogleConfigured) return 'Google Sign-In is not configured yet (see README).';
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null; // user cancelled
    const idToken = res.data.idToken;
    if (!idToken) return 'Google did not return an ID token.';
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    return error ? error.message : null;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'Google Play Services is unavailable.';
    }
    return e instanceof Error ? e.message : 'Sign-in failed.';
  }
}

/** Step 1 of email sign-in: email a one-time code (creates the account if new). */
export async function sendEmailCode(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  return error ? error.message : null;
}

/** Step 2: exchange the emailed code for a session. */
export async function verifyEmailCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  return error ? error.message : null;
}

/** Wipes this user's local database + photos, then signs out. Unsynced changes are lost. */
export async function signOut() {
  await stopSyncAndWipe().catch((e: unknown) => console.warn('[sync] wipe failed', e));
  await Promise.allSettled([GoogleSignin.signOut(), supabase.auth.signOut()]);
  queryClient.clear(); // don't leave one user's data cached for the next
}
