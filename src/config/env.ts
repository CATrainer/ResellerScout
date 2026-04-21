/**
 * Centralised environment-variable access.
 *
 * Two sources:
 *  1. App runtime (React Native bundle): `EXPO_PUBLIC_*` vars compiled in at build-time.
 *     Bundle holds no Anthropic secrets from Day 4 onward — calls route through the
 *     Supabase Edge Function proxy at `supabase/functions/anthropic-proxy/`.
 *  2. Node scripts (benchmark-vision, migrations, etc): loaded via dotenv in the script entry.
 *
 * NEVER log `env.*` values (secret shared-secret + anon key + RC key are all here).
 */

const fromNode = (key: string): string | undefined =>
  typeof process !== 'undefined' && process.env ? process.env[key] : undefined;

const required = (key: string, value: string | undefined): string => {
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${key}. Check .env against .env.example.`);
  }
  return value;
};

export const nodeEnv = {
  // Vision benchmark — Node-side only, never in the bundle.
  anthropicApiKey: () => required('ANTHROPIC_API_KEY', fromNode('ANTHROPIC_API_KEY')),
  anthropicVisionModel: () => fromNode('ANTHROPIC_VISION_MODEL') ?? 'claude-opus-4-7',
  anthropicVisionModelTier2: () => fromNode('ANTHROPIC_VISION_MODEL_TIER2') ?? 'claude-sonnet-4-6',

  // Optional benchmark peers (disabled for v1; re-enable to re-run 3-way)
  openaiApiKey: () => fromNode('OPENAI_API_KEY'),
  googleAiApiKey: () => fromNode('GOOGLE_AI_API_KEY'),

  // Supabase (server-side) — used by Node scripts that need service-role privileges
  supabaseServiceRoleKey: () =>
    required('SUPABASE_SERVICE_ROLE_KEY', fromNode('SUPABASE_SERVICE_ROLE_KEY')),
};

/**
 * App-bundle env. Only EXPO_PUBLIC_* vars are accessible here.
 *
 * Day-4 migration: `EXPO_PUBLIC_ANTHROPIC_API_KEY` is GONE from the bundle. The app
 * now calls the Edge Function proxy, which holds the real Anthropic key in Supabase
 * project secrets. See supabase/functions/anthropic-proxy/index.ts for rationale.
 */
export const appEnv = {
  supabaseUrl: (): string =>
    required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: (): string =>
    required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),

  // Anthropic proxy — URL of the deployed anthropic-proxy Edge Function.
  // Typical shape: https://<project-ref>.supabase.co/functions/v1/anthropic-proxy
  proxyUrl: (): string =>
    required('EXPO_PUBLIC_PROXY_URL', process.env.EXPO_PUBLIC_PROXY_URL),

  // Shared-secret header value. Matches PROXY_SHARED_SECRET set on the Edge Function.
  // In the bundle (same extraction risk as the old Anthropic key), but the blast radius
  // is bounded — see anthropic-proxy/index.ts header comment.
  proxySharedSecret: (): string =>
    required('EXPO_PUBLIC_PROXY_SHARED_SECRET', process.env.EXPO_PUBLIC_PROXY_SHARED_SECRET),

  revenueCatIosKey: (): string | undefined => process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  revenueCatAndroidKey: (): string | undefined => process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
};
