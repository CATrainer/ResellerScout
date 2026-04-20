/**
 * Centralised environment-variable access.
 *
 * Two sources:
 *  1. App runtime (React Native bundle): uses `expo-constants` + `EXPO_PUBLIC_*` vars from app.json/.env.
 *  2. Node scripts (benchmark, test-ebay): uses `dotenv` loaded in the script entry point.
 *
 * Rule: anything the app bundle reads MUST be prefixed EXPO_PUBLIC_.
 * Secrets the user should never have on-device (OpenAI key, eBay CertID, Supabase service role) stay
 * Node-only and are accessed via this module from scripts.
 *
 * Never log `env.*` values.
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
  // eBay
  ebayAppId: () => required('EBAY_APP_ID', fromNode('EBAY_APP_ID')),
  ebayCertId: () => required('EBAY_CERT_ID', fromNode('EBAY_CERT_ID')),
  ebayDevId: () => fromNode('EBAY_DEV_ID') ?? '',
  ebayEnv: (): 'production' | 'sandbox' =>
    (fromNode('EBAY_ENV') as 'production' | 'sandbox') ?? 'production',

  // Vision models
  openaiApiKey: () => required('OPENAI_API_KEY', fromNode('OPENAI_API_KEY')),
  replicateApiToken: () => required('REPLICATE_API_TOKEN', fromNode('REPLICATE_API_TOKEN')),

  // Supabase (server-side)
  supabaseServiceRoleKey: () =>
    required('SUPABASE_SERVICE_ROLE_KEY', fromNode('SUPABASE_SERVICE_ROLE_KEY')),
};

/**
 * App-bundle env. Only EXPO_PUBLIC_* vars are accessible here.
 * Values come from `expo-constants`.Extra at build/runtime, populated from .env at build-time.
 */
export const appEnv = {
  supabaseUrl: (): string =>
    required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: (): string =>
    required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  revenueCatIosKey: (): string | undefined => process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  revenueCatAndroidKey: (): string | undefined => process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
};
