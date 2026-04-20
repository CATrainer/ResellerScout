/**
 * eBay Finding API service.
 *
 * Legal-clean data source for UK sold-listing comparables.
 *
 * Why Finding API? The legacy Finding API (`findCompletedItems`) still exposes sold-listing data
 * publicly with an App ID only. The modern Browse API is faster but does not expose completed/sold
 * listings. We need sold prices, so Finding API wins for v1. If eBay sunsets Finding we fall back to
 * ScrapingBee + the UK sold-listings page per tasks.md "blocked" notes.
 *
 * Rate limit (prod, approx 2025-2026): 5,000 calls/day per App ID, ~100 calls/minute burst.
 * If we 10x beyond that we move to sandbox for dev or request a tier bump.
 *
 * Usage (Node — from scripts/):
 *   import { searchSoldListings } from '../src/services/ebayService';
 *   const res = await searchSoldListings('Next size 10 dress', { marketplace: 'EBAY-GB', limit: 10 });
 *
 * Usage (app bundle): wrap this call behind a serverless proxy (Supabase Edge Function) so the App ID
 * never ships in the bundle. Day 2 or later — not needed for the Day 1 proof.
 */

export type EbayMarketplace = 'EBAY-GB' | 'EBAY-US' | 'EBAY-DE' | 'EBAY-FR' | 'EBAY-IT';

export interface SoldListing {
  itemId: string;
  title: string;
  priceGbp: number;
  currency: string;
  soldDate: Date;
  conditionDisplayName?: string;
  galleryUrl?: string;
  viewItemUrl?: string;
  categoryName?: string;
}

export interface SearchOptions {
  marketplace?: EbayMarketplace;
  limit?: number;
  /** Restrict to a category id (e.g. clothing = 11450). Optional. */
  categoryId?: string;
  /** Only return completed + SoldItemsOnly. Default true. */
  soldOnly?: boolean;
  /** Override env var. Only used from Node scripts/tests. */
  appId?: string;
}

export interface SearchResult {
  listings: SoldListing[];
  totalEntries: number;
  rawResponseSummary: {
    queryUrl: string;
    elapsedMs: number;
    ack: string;
    timestamp: string;
  };
}

const GLOBAL_ID_BY_MARKETPLACE: Record<EbayMarketplace, string> = {
  'EBAY-GB': 'EBAY-GB',
  'EBAY-US': 'EBAY-US',
  'EBAY-DE': 'EBAY-DE',
  'EBAY-FR': 'EBAY-FR',
  'EBAY-IT': 'EBAY-IT',
};

const FINDING_ENDPOINT_PROD = 'https://svcs.ebay.com/services/search/FindingService/v1';
const FINDING_ENDPOINT_SANDBOX = 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1';

/**
 * Resolve App ID with the following precedence:
 *   1. options.appId (explicit call-site)
 *   2. EBAY_APP_ID env var (prod) or EBAY_SANDBOX_APP_ID (sandbox)
 */
function resolveAppId(opts: SearchOptions): { appId: string; endpoint: string } {
  const env = (process.env.EBAY_ENV ?? 'production') as 'production' | 'sandbox';
  const endpoint = env === 'sandbox' ? FINDING_ENDPOINT_SANDBOX : FINDING_ENDPOINT_PROD;
  const explicit = opts.appId;
  const fromEnv = env === 'sandbox' ? process.env.EBAY_SANDBOX_APP_ID : process.env.EBAY_APP_ID;
  const appId = explicit ?? fromEnv;
  if (!appId) {
    throw new Error(
      `EBAY_APP_ID (or EBAY_SANDBOX_APP_ID for sandbox) missing. Check .env against .env.example.`,
    );
  }
  return { appId, endpoint };
}

/**
 * Query recent sold listings for a keyword on a given marketplace.
 *
 * Returns `{ listings, totalEntries, rawResponseSummary }`. The summary is used by the test script
 * and docs/ebay-api-notes.md to log latency + shape of the response.
 */
export async function searchSoldListings(
  keywords: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const { appId, endpoint } = resolveAppId(opts);
  const marketplace = opts.marketplace ?? 'EBAY-GB';
  const limit = Math.min(opts.limit ?? 20, 100);
  const soldOnly = opts.soldOnly !== false;

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.13.0',
    'SECURITY-APPNAME': appId,
    'GLOBAL-ID': GLOBAL_ID_BY_MARKETPLACE[marketplace],
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': 'true',
    keywords,
    'paginationInput.entriesPerPage': String(limit),
    'sortOrder': 'EndTimeSoonest',
  });

  // Filter: sold-only
  if (soldOnly) {
    params.append('itemFilter(0).name', 'SoldItemsOnly');
    params.append('itemFilter(0).value', 'true');
  }
  // Filter: category (optional)
  if (opts.categoryId) {
    params.append('categoryId', opts.categoryId);
  }

  const url = `${endpoint}?${params.toString()}`;
  const started = Date.now();

  const res = await fetch(url, { method: 'GET' });
  const elapsedMs = Date.now() - started;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay Finding API HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = await res.json();
  const envelope = body.findCompletedItemsResponse?.[0];
  if (!envelope) {
    throw new Error(`Unexpected eBay response shape: ${JSON.stringify(body).slice(0, 500)}`);
  }
  const ack = envelope.ack?.[0] ?? 'Unknown';
  if (ack !== 'Success') {
    const errors = envelope.errorMessage?.[0]?.error ?? [];
    const reason = errors.map((e: any) => e.message?.[0]).join('; ') || 'Unknown eBay error';
    throw new Error(`eBay Finding API ack=${ack}: ${reason}`);
  }

  const searchResult = envelope.searchResult?.[0];
  const items = searchResult?.item ?? [];
  const totalEntries = Number(envelope.paginationOutput?.[0]?.totalEntries?.[0] ?? 0);

  const listings: SoldListing[] = items.map((it: any) => {
    const sellingStatus = it.sellingStatus?.[0];
    const price = sellingStatus?.currentPrice?.[0];
    const endTime = it.listingInfo?.[0]?.endTime?.[0];
    return {
      itemId: it.itemId?.[0] ?? '',
      title: it.title?.[0] ?? '',
      priceGbp: Number(price?.__value__ ?? 0),
      currency: price?.['@currencyId'] ?? 'GBP',
      soldDate: endTime ? new Date(endTime) : new Date(0),
      conditionDisplayName: it.condition?.[0]?.conditionDisplayName?.[0],
      galleryUrl: it.galleryURL?.[0],
      viewItemUrl: it.viewItemURL?.[0],
      categoryName: it.primaryCategory?.[0]?.categoryName?.[0],
    };
  });

  return {
    listings,
    totalEntries,
    rawResponseSummary: {
      queryUrl: url.replace(appId, 'REDACTED_APP_ID'),
      elapsedMs,
      ack,
      timestamp: envelope.timestamp?.[0] ?? new Date().toISOString(),
    },
  };
}

/**
 * Compute a "suggested Vinted price" heuristic from a list of sold comps.
 * v1 heuristic: median of sold prices, clipped to IQR. Replace with a smarter model
 * once we have real data.
 */
export function suggestPriceFromComps(listings: SoldListing[]): {
  suggestedGbp: number;
  lowGbp: number;
  highGbp: number;
  n: number;
} | null {
  if (!listings.length) return null;
  const prices = listings.map(l => l.priceGbp).filter(p => p > 0).sort((a, b) => a - b);
  if (!prices.length) return null;

  const q = (p: number) => {
    const idx = (prices.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? prices[lo] : prices[lo] + (prices[hi] - prices[lo]) * (idx - lo);
  };
  const q1 = q(0.25);
  const median = q(0.5);
  const q3 = q(0.75);

  return {
    suggestedGbp: Math.round(median * 100) / 100,
    lowGbp: Math.round(q1 * 100) / 100,
    highGbp: Math.round(q3 * 100) / 100,
    n: prices.length,
  };
}
