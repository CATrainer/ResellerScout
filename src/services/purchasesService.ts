/**
 * RevenueCat (Purchases) service.
 *
 * Day-4: scaffolds subscription management through `react-native-purchases`.
 * Two paid tiers (per design/worthit.md and decisions.md 2026-04-09):
 *   - WorthIt Pro         — 100 scans/month, £6.99/mo or £49.99/yr, 3-day free trial
 *   - WorthIt Pro Plus    — unlimited scans,  £11.99/mo or £89.99/yr, 3-day free trial
 *
 * RevenueCat dashboard glossary:
 *   - "Offering"  = a bundle of packages shown on the paywall (we use the default).
 *   - "Package"   = one subscription SKU (monthly / annual / trial).
 *   - "Entitlement" = the logical feature gate ('pro', 'pro_plus') that an active
 *     subscription unlocks. We check entitlements, not SKUs.
 *
 * We deliberately keep this layer small: init, getOfferings, purchasePackage,
 * restorePurchases, getEntitlement, logIn/logOut to bind the RC app-user id to
 * the Supabase user id (so Apple-restored purchases follow the Supabase user
 * across devices).
 *
 * NOTE: the SDK's exact enum names / types may shift between 8.x minor versions;
 * we keep `any` escape hatches below (marked with `// RC-TYPE`) for the fields
 * where SDK types changed most between 8.0 and 8.2. Revisit post-TestFlight.
 */

import { Platform } from 'react-native';
import { appEnv } from '../config/env';

/**
 * Our two paid entitlement keys. These MUST match the entitlement identifiers
 * configured in the RevenueCat dashboard (Project → Entitlements).
 */
export type EntitlementKey = 'pro' | 'pro_plus';

export type Plan = 'free' | EntitlementKey;

export class PurchasesError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'not_configured'
      | 'cancelled'
      | 'network'
      | 'no_offerings'
      | 'store'
      | 'unknown',
  ) {
    super(message);
    this.name = 'PurchasesError';
  }
}

// The SDK module is loaded lazily so the Paywall screen doesn't crash during
// Expo Go dev where native RC modules aren't available. All calls go through
// the getter below and gracefully no-op if the SDK isn't present.
type PurchasesSdk = typeof import('react-native-purchases').default;
let _sdk: PurchasesSdk | null | undefined = undefined; // undefined=unloaded, null=unavailable

async function getSdk(): Promise<PurchasesSdk | null> {
  if (_sdk !== undefined) return _sdk;
  try {
    const mod = await import('react-native-purchases');
    _sdk = mod.default;
  } catch {
    _sdk = null;
  }
  return _sdk;
}

let _configured = false;

/**
 * Initialise RevenueCat with the platform-appropriate SDK key. Safe to call
 * multiple times — subsequent calls are no-ops.
 *
 * Called from App.tsx on mount (before the first Paywall render).
 */
export async function configurePurchases(): Promise<void> {
  if (_configured) return;
  const sdk = await getSdk();
  if (!sdk) return; // Expo Go / web — no native module; paywall will show "unavailable" banner.

  const apiKey =
    Platform.OS === 'ios' ? appEnv.revenueCatIosKey() : appEnv.revenueCatAndroidKey();
  if (!apiKey) {
    throw new PurchasesError(
      `RevenueCat ${Platform.OS} key missing. Set EXPO_PUBLIC_REVENUECAT_${Platform.OS === 'ios' ? 'IOS' : 'ANDROID'}_KEY.`,
      'not_configured',
    );
  }

  // configure() is synchronous in older SDK versions and returns void in 8.x.
  // RC-TYPE: the 8.x typings mark configure() as returning void | Promise<void>
  // depending on minor version. Awaitable coercion keeps both shapes happy.
  await Promise.resolve((sdk as unknown as { configure: (o: { apiKey: string }) => unknown }).configure({ apiKey }));
  _configured = true;
}

/**
 * Bind the RC anonymous user id to our Supabase user id. Call this immediately
 * after a successful Supabase sign-in so purchases + entitlements follow the
 * user across devices.
 */
export async function logInPurchases(userId: string): Promise<void> {
  const sdk = await getSdk();
  if (!sdk || !_configured) return;
  try {
    // RC-TYPE: logIn returns { customerInfo, created } in 8.x.
    await (sdk as unknown as { logIn: (id: string) => Promise<unknown> }).logIn(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PurchasesError(`RevenueCat logIn failed: ${msg}`, 'unknown');
  }
}

/** Reset RC to an anonymous id. Call on Supabase sign-out. */
export async function logOutPurchases(): Promise<void> {
  const sdk = await getSdk();
  if (!sdk || !_configured) return;
  try {
    await (sdk as unknown as { logOut: () => Promise<unknown> }).logOut();
  } catch {
    // Best-effort — don't block sign-out on an RC hiccup.
  }
}

/**
 * Fetch the default offering. Returns null if RC isn't configured or no
 * offering is set up yet (Caleb hasn't filled in the dashboard yet).
 *
 * Shape returned mirrors the RC SDK's Offering type (we avoid re-declaring it
 * to keep the stub thin; the Paywall screen treats this as opaque and reads
 * `.availablePackages`, `.monthly`, `.annual` defensively).
 */
export async function getDefaultOffering(): Promise<unknown> {
  const sdk = await getSdk();
  if (!sdk) return null;
  try {
    const offerings = await (
      sdk as unknown as { getOfferings: () => Promise<{ current?: unknown }> }
    ).getOfferings();
    return offerings.current ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PurchasesError(`Failed to load offerings: ${msg}`, 'network');
  }
}

/**
 * Purchase the given package. Returns the active entitlement key on success,
 * or throws PurchasesError on failure. Cancellation is a distinct kind so the
 * Paywall can silently return the user to the paywall state.
 */
export async function purchasePackage(pkg: unknown): Promise<EntitlementKey | null> {
  const sdk = await getSdk();
  if (!sdk) throw new PurchasesError('Purchases SDK not available.', 'not_configured');
  try {
    // RC-TYPE: purchasePackage returns { customerInfo, productIdentifier } in 8.x.
    const result = await (
      sdk as unknown as {
        purchasePackage: (p: unknown) => Promise<{ customerInfo: unknown }>;
      }
    ).purchasePackage(pkg);
    return extractEntitlement(result.customerInfo);
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) {
      throw new PurchasesError('Purchase cancelled.', 'cancelled');
    }
    throw new PurchasesError(`Purchase failed: ${err?.message ?? String(e)}`, 'store');
  }
}

/**
 * Restore previous purchases (Apple Guideline 3.1.1 — required button on the
 * Paywall). Returns the entitlement the user ended up with (or null if none).
 */
export async function restorePurchases(): Promise<EntitlementKey | null> {
  const sdk = await getSdk();
  if (!sdk) throw new PurchasesError('Purchases SDK not available.', 'not_configured');
  try {
    const customerInfo = await (
      sdk as unknown as { restorePurchases: () => Promise<unknown> }
    ).restorePurchases();
    return extractEntitlement(customerInfo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PurchasesError(`Restore failed: ${msg}`, 'store');
  }
}

/**
 * Read the current entitlement from cached RC state (no network). Used by
 * Home + Settings screens to render the "Plan: Pro" pill.
 */
export async function getEntitlement(): Promise<EntitlementKey | null> {
  const sdk = await getSdk();
  if (!sdk) return null;
  try {
    const customerInfo = await (
      sdk as unknown as { getCustomerInfo: () => Promise<unknown> }
    ).getCustomerInfo();
    return extractEntitlement(customerInfo);
  } catch {
    return null;
  }
}

/**
 * Pull the active entitlement key off a RC CustomerInfo object.
 * Checks 'pro_plus' first (higher tier wins if both are somehow active).
 */
function extractEntitlement(customerInfo: unknown): EntitlementKey | null {
  const info = customerInfo as
    | { entitlements?: { active?: Record<string, unknown> } }
    | undefined;
  const active = info?.entitlements?.active ?? {};
  if (active.pro_plus) return 'pro_plus';
  if (active.pro) return 'pro';
  return null;
}
