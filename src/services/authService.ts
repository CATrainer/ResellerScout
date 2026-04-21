/**
 * Authentication service — Apple Sign-In → Supabase Auth.
 *
 * Day-4: wires Sign in with Apple (via `expo-apple-authentication`) into Supabase.
 * The flow:
 *   1. Caleb taps "Sign in with Apple" on the Paywall screen (or Home → Settings
 *      → Account if not yet signed in).
 *   2. Apple presents its native sheet, returns an `identityToken` (a JWT).
 *   3. We call `supabase.auth.signInWithIdToken({ provider: 'apple', token })`
 *      which exchanges the Apple token for a Supabase session JWT.
 *   4. The Supabase `handle_new_user` trigger creates the matching `public.users`
 *      row with plan='free' on first sign-in.
 *
 * On Day-5 the anthropic-proxy will read `Authorization: Bearer <session.access_token>`
 * instead of the anon key, so the Edge Function can identify the caller via
 * `auth.uid()` for per-user rate-limit enforcement.
 *
 * App Store requirement: Sign in with Apple is mandatory for any app offering
 * third-party sign-in. We only offer Apple for v1 — simplest compliance path.
 * Guideline 4.8. [verified 2026-04-20]
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabaseClient';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'cancelled'
      | 'unavailable'
      | 'no_token'
      | 'supabase'
      | 'unknown',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * True iff Sign in with Apple is available on this device. iOS 13+ only.
 * Android always returns false — v1 is iOS-first; the Paywall + Settings screens
 * should hide the Apple button on non-iOS platforms.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Present Apple Sign-In, then exchange the id token for a Supabase session.
 * Returns the fresh Supabase session on success. Throws `AuthError` on failure.
 *
 * On cancellation (user dismissed Apple sheet), Apple throws an error whose code
 * is 'ERR_REQUEST_CANCELED'. We map that to AuthError kind='cancelled' so the
 * Paywall screen can silently fall back to the "Not now" state.
 */
export async function signInWithApple(): Promise<Session> {
  if (!(await isAppleAuthAvailable())) {
    throw new AuthError(
      'Sign in with Apple is not available on this device.',
      'unavailable',
    );
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      throw new AuthError('Sign-in cancelled.', 'cancelled');
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new AuthError(`Apple sign-in failed: ${msg}`, 'unknown');
  }

  const idToken = credential.identityToken;
  if (!idToken) {
    throw new AuthError('Apple did not return an identity token.', 'no_token');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
  });
  if (error || !data.session) {
    throw new AuthError(
      `Supabase rejected Apple id token: ${error?.message ?? 'no session returned'}`,
      'supabase',
    );
  }
  return data.session;
}

/**
 * Sign the current user out. Clears the Supabase session (AsyncStorage) and
 * resets RevenueCat's anonymous user id (caller handles the latter via
 * purchasesService.logOut so the two services stay decoupled here).
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new AuthError(`Sign-out failed: ${error.message}`, 'supabase');
  }
}

/**
 * Snapshot the current user from the persisted Supabase session.
 * Returns null if not signed in. Safe to call before the session is loaded —
 * supabase-js caches the session in memory after the first restore.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * Subscribe to auth state changes. Returns an unsubscribe fn.
 * Called from App.tsx on mount to keep the Zustand store's `user` in sync.
 */
export function onAuthStateChange(
  cb: (session: Session | null) => void,
): () => void {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session);
  });
  return () => data.subscription.unsubscribe();
}
