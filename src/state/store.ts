/**
 * Screen + scan state for WorthIt Day 4.
 *
 * Seven core screens driven by a Zustand store with a `Screen` enum. Flow A uses four
 * (home → camera → loading → priceReveal); Flow B adds three (idReview → platformPick
 * → listing) reached as an upgrade from priceReveal. LoadingScreen is shared between
 * flows via `loadingMode`.
 *
 * Day-4 adds two modal-ish states — `paywall` (hard paywall after first free scan) and
 * `settings` (Home gear). Both remember `previousScreen` so `closeModal()` returns the
 * user to exactly where they were. Paywall entry is driven by PriceReveal + HomeScreen
 * checks against `plan` + `scansUsedToday` (see design/worthit.md § Monetisation).
 *
 * Migration to expo-router deferred to Day 5 / post-TestFlight (decisions.md 2026-04-20 Day-3).
 * The store-driven enum is simpler than a router today; back-button + deep linking become
 * worth the migration cost once TestFlight feedback starts asking for them.
 *
 * Scan-counting rule: `scanCountedThisSession` is set to `true` on the first Price Reveal
 * render of a session and is NOT reset by upgrading to Flow B or regenerating a listing.
 * `goHome()` and `reset()` both clear it. `scansUsedToday` increments by exactly 1 per
 * scan-session (enforced by the guard).
 */

import { create } from 'zustand';
import type {
  EstimateResult,
  FlowBOverrides,
  FlowKind,
  ListingResult,
  LoadingMode,
  PlatformKey,
  Plan,
  Screen,
} from '../types';

const ALL_PLATFORMS: PlatformKey[] = ['vinted', 'depop', 'ebay'];

interface ScanState {
  screen: Screen;
  /** Screen to return to when a modal-ish overlay (paywall / settings) closes. */
  previousScreen: Screen;
  flow: FlowKind | null;

  // Capture
  imageUri: string | null;
  imageBase64: string | null;
  imageMime: 'image/jpeg' | 'image/png' | null;

  // Flow A result
  estimate: EstimateResult | null;

  // Flow B inputs + result
  idOverrides: FlowBOverrides;
  selectedPlatforms: PlatformKey[];
  listing: ListingResult | null;

  // Shared
  loadingMode: LoadingMode | null;
  error: string | null;

  // Scan-counter guard — does NOT increment on upgrade or regenerate.
  scanCountedThisSession: boolean;
  scansUsedToday: number;

  // Day-4: auth + plan snapshot. `userId` / `userEmail` populated after Supabase
  // sign-in; null when signed out. `plan` mirrors the current RC entitlement;
  // defaults to 'free' until the first getCustomerInfo() round-trip lands.
  userId: string | null;
  userEmail: string | null;
  plan: Plan;

  // actions
  goHome: () => void;
  startFlow: (flow: FlowKind) => void;
  setCapture: (p: { uri: string; base64: string; mime: 'image/jpeg' | 'image/png' }) => void;
  setEstimate: (estimate: EstimateResult) => void;
  markScanCounted: () => void;
  upgradeToFlowB: () => void;
  confirmId: (overrides: FlowBOverrides) => void;
  selectPlatforms: (platforms: PlatformKey[]) => void;
  togglePlatform: (platform: PlatformKey) => void;
  startListingCall: () => void;
  setListing: (listing: ListingResult) => void;
  regenerateListing: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  reset: () => void;

  // Day-4 additions
  setUser: (p: { id: string; email: string | null } | null) => void;
  setPlan: (plan: Plan) => void;
  openPaywall: () => void;
  openSettings: () => void;
  closeModal: () => void;
}

const BLANK = {
  screen: 'home' as Screen,
  previousScreen: 'home' as Screen,
  flow: null as FlowKind | null,
  imageUri: null as string | null,
  imageBase64: null as string | null,
  imageMime: null as 'image/jpeg' | 'image/png' | null,
  estimate: null as EstimateResult | null,
  idOverrides: {} as FlowBOverrides,
  selectedPlatforms: [...ALL_PLATFORMS],
  listing: null as ListingResult | null,
  loadingMode: null as LoadingMode | null,
  error: null as string | null,
  scanCountedThisSession: false,
};

export const useStore = create<ScanState>((set, get) => ({
  ...BLANK,
  scansUsedToday: 0,
  userId: null,
  userEmail: null,
  plan: 'free' as Plan,

  goHome: () => set({ ...BLANK }),

  startFlow: (flow) =>
    set({
      ...BLANK,
      screen: 'camera',
      flow,
    }),

  setCapture: ({ uri, base64, mime }) =>
    set({
      screen: 'loading',
      loadingMode: 'estimate',
      imageUri: uri,
      imageBase64: base64,
      imageMime: mime,
      error: null,
    }),

  setEstimate: (estimate) =>
    set({
      screen: 'priceReveal',
      estimate,
      loadingMode: null,
      error: null,
    }),

  /**
   * Called by PriceRevealScreen on its first successful render (via effect) to
   * decrement the free-tier counter exactly once per scan-session.
   * Guarded by `scanCountedThisSession` so upgrading to Flow B or regenerating
   * a listing does NOT double-count.
   */
  markScanCounted: () => {
    const s = get();
    if (s.scanCountedThisSession) return;
    set({
      scanCountedThisSession: true,
      scansUsedToday: s.scansUsedToday + 1,
    });
  },

  upgradeToFlowB: () =>
    set({
      screen: 'idReview',
      flow: 'B',
      error: null,
    }),

  confirmId: (overrides) =>
    set({
      screen: 'platformPick',
      idOverrides: { ...overrides },
      error: null,
    }),

  selectPlatforms: (platforms) => set({ selectedPlatforms: [...platforms] }),

  togglePlatform: (platform) => {
    const s = get();
    const has = s.selectedPlatforms.includes(platform);
    const next = has
      ? s.selectedPlatforms.filter((p) => p !== platform)
      : [...s.selectedPlatforms, platform];
    set({ selectedPlatforms: next });
  },

  startListingCall: () =>
    set({
      screen: 'loading',
      loadingMode: 'listing',
      error: null,
    }),

  setListing: (listing) =>
    set({
      screen: 'listing',
      listing,
      loadingMode: null,
      error: null,
    }),

  /**
   * Triggered from the Listing screen's "Regenerate" button. Clears the prior
   * listing + any error and re-enters the loading state with mode=listing.
   * Deliberately does NOT touch `scanCountedThisSession` — regeneration is free
   * against the scan-counter (but Day-5+ may rate-limit against a separate counter).
   */
  regenerateListing: () =>
    set({
      screen: 'loading',
      loadingMode: 'listing',
      listing: null,
      error: null,
    }),

  setError: (error) => {
    // Route to the screen that owns the error UI for the current loading mode.
    const mode = get().loadingMode;
    if (mode === 'listing') {
      set({ error, screen: 'listing', loadingMode: null });
    } else {
      set({ error, screen: 'priceReveal', loadingMode: null });
    }
  },

  clearError: () => set({ error: null }),

  /**
   * Full session reset, including scan counter. Used when the user "Start over"s
   * explicitly or when the session errored and they bounce home. Distinct from
   * `goHome()` which resets session state; `reset()` also resets scansUsedToday
   * (use sparingly — this is "clear all").
   */
  reset: () => set({ ...BLANK, scansUsedToday: 0 }),

  setUser: (u) =>
    set(
      u === null
        ? { userId: null, userEmail: null }
        : { userId: u.id, userEmail: u.email },
    ),

  setPlan: (plan) => set({ plan }),

  /**
   * Enter the paywall overlay, remembering the current screen so `closeModal()`
   * can pop back to it. Called from:
   *   - HomeScreen's scan-start guard (free user has already used their scan)
   *   - PriceRevealScreen (on estimate success for a free user past the cap)
   *   - SettingsScreen "Upgrade" tap
   */
  openPaywall: () => {
    const cur = get().screen;
    // If we're already on paywall, don't overwrite previousScreen with itself.
    if (cur === 'paywall') return;
    set({ screen: 'paywall', previousScreen: cur });
  },

  /** Launch Settings from the Home gear icon (or any other surface). */
  openSettings: () => {
    const cur = get().screen;
    if (cur === 'settings') return;
    set({ screen: 'settings', previousScreen: cur });
  },

  /** Return to the screen we were on before paywall / settings was opened. */
  closeModal: () => {
    const prev = get().previousScreen;
    set({ screen: prev });
  },
}));
