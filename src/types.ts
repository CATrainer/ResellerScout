/**
 * Shared types for WorthIt v1.
 *
 * Canonical product shape: personal/app-machine/design/worthit.md (v5).
 * Three personas × two flows. Flow A + Flow B end-to-end by end of Day 3.
 */

export type FlowKind = 'A' | 'B';

export type Confidence = 'high' | 'medium' | 'low';

/**
 * The structured result returned by the Claude vision-and-reasoning call
 * used by Flow A. Flow B consumes the `identification` sub-object (plus
 * any ID Review overrides and the suggested price) as input to the listing call.
 */
export interface EstimateResult {
  identification: {
    brand: string;
    category: string;
    size: string;
    colour: string;
    condition?: string; // populated by prompt v0.2; read-only in Flow A UI, used by Flow B.
  };
  price: {
    suggestedGbp: number;
    rangeLowGbp: number;
    rangeHighGbp: number;
  };
  confidence: Confidence;
  /** Claude's self-reported numeric confidence 0-1 — used for UI confidence pill. */
  rawConfidence: number;
  /**
   * A short 1-sentence rationale Claude gives for the price.
   * Surfaced in the "why?" tap-through on the price card.
   */
  reasoningSummary: string;
  /** Model id that produced this result — recorded for FSD auditing + analytics. */
  modelUsed: string;
  /** End-to-end latency from photo submit to parsed result (ms). Latency metric bar source. */
  latencyMs: number;
}

/**
 * Flow B — user-edited overrides applied on the ID Review screen.
 * Colour + category are read-only in v1 so they don't appear here.
 * Material + fit not collected in v1 (see design/worthit.md § Open decisions).
 */
export interface FlowBOverrides {
  brand?: string;
  size?: string;
  condition?: string;
}

/**
 * Platforms the user can generate listings for. Multi-select on the Platform Pick screen.
 */
export type PlatformKey = 'vinted' | 'depop' | 'ebay';

/**
 * A single generated listing for one platform.
 *
 * `hashtags` is Depop-only in v1 — Vinted uses keyword density in the description,
 * eBay uses structured item specifics. Kept optional on the shared shape for future
 * platform additions (TikTok Shop etc).
 */
export interface PlatformListing {
  title: string;
  description: string;
  hashtags?: string[];
}

/**
 * The structured result returned by the Claude Sonnet 4.6 `FLOW_B_LISTING` call.
 * Per-platform optional keys — only the platforms in the request's `selectedPlatforms`
 * are populated. `partialErrors` carries the platform keys that failed to parse
 * (defensive fallback for partial model output — see claudeListingService.ts).
 */
export interface ListingResult {
  vinted?: PlatformListing;
  depop?: PlatformListing;
  ebay?: PlatformListing;
  partialErrors?: PlatformKey[];
  /** Model id that produced this result — recorded for FSD auditing + analytics. */
  modelUsed: string;
  /** End-to-end latency from request start to parsed result (ms). <20s metric bar source. */
  latencyMs: number;
}

/**
 * A single scan session. Held in the store until the user bounces back to Home.
 * Persisted to Supabase on Day 4+.
 */
export interface ScanSession {
  id: string; // local uuid until Supabase write
  flow: FlowKind;
  imageUri: string;
  imageBase64: string;
  imageMime: 'image/jpeg' | 'image/png';
  startedAt: number;
  estimate?: EstimateResult;
  listing?: ListingResult;
  error?: string;
}

/**
 * Screen enum driving the Zustand-backed router.
 *
 * Core seven (Flow A + B):
 *   home → camera → loading (estimate mode) → priceReveal
 *                              ↓                 ↓
 *                              listing ← loading (listing mode) ← platformPick ← idReview
 *
 * Day-4 adds two modal-ish states:
 *   paywall   — blocking overlay when the daily free-scan cap is hit. Entered from
 *               priceReveal (post-first-scan cap) or tapped from Settings.
 *   settings  — launched from the Home gear icon (plan, sign-out, legal, preview
 *               pricing explainer).
 *
 * Both paywall + settings remember the previous screen via store.previousScreen,
 * so `closeModal()` returns the user to exactly where they were.
 *
 * Migration to expo-router deferred to Day 5 / post-TestFlight (see decisions.md 2026-04-20 Day-3).
 */
export type Screen =
  | 'home'
  | 'camera'
  | 'loading'
  | 'priceReveal'
  | 'idReview'
  | 'platformPick'
  | 'listing'
  | 'paywall'
  | 'settings';

/**
 * The LoadingScreen fires one of two services depending on mode.
 * Flow A mode = estimate call (Claude Opus 4.7 vision).
 * Flow B mode = listing call (Claude Sonnet 4.6 text).
 */
export type LoadingMode = 'estimate' | 'listing';

/**
 * Subscription plan flag, mirrored from RevenueCat entitlements + Supabase
 * `users.plan`. Free = no paid entitlement active.
 */
export type Plan = 'free' | 'pro' | 'pro_plus';
