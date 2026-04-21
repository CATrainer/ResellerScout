/**
 * Supabase client singleton.
 *
 * Day-4: holds the auth session for the RN app. Used by:
 *   - authService (Apple Sign-In → Supabase sign-in-with-id-token)
 *   - anthropicProxy (Authorization: Bearer <session jwt>) — Day-5 upgrade path
 *     replaces the anon-key Bearer with the user JWT so the Edge Function can
 *     read `auth.uid()` for per-user rate-limit enforcement.
 *
 * AsyncStorage adapter: Supabase needs persistent storage for the session so the
 * user stays logged in between app launches. Default web-localStorage won't work
 * on RN — we plug in @react-native-async-storage/async-storage.
 *
 * No DB reads / writes from the client in Day 4 — the `users` + `rate_limits`
 * tables are read server-side by the Edge Function. If we later add a client-side
 * "Plan" read for Settings, it'll go through this same client with RLS scoping
 * by `auth.uid() = id`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appEnv } from '../config/env';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(appEnv.supabaseUrl(), appEnv.supabaseAnonKey(), {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // RN doesn't have URL-based redirect flows — Apple Sign-In returns the id_token
      // directly to the device, which we then exchange for a Supabase session.
      detectSessionInUrl: false,
    },
  });
  return _client;
}
