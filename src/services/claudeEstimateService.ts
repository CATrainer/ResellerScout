/**
 * Claude-powered estimate service — Flow A (Quick Estimate).
 *
 * Input: a photo (base64 + mime type).
 * Output: an `EstimateResult` — identification + price range + suggested price + rationale.
 *
 * Model: `claude-opus-4-7` via Anthropic Messages API.
 * [verified 2026-04-20 — plan-v5 locked single-vendor for v1.]
 *
 * Prompt: locked at `FLOW_A_ESTIMATE v0.2` — see `docs/prompts.md`.
 * Any change to the prompt: bump the version in docs/prompts.md AND in PROMPT_VERSION below.
 *
 * ============================================================================
 * Day-4 proxy migration
 * ============================================================================
 * The Anthropic API is now called through `supabase/functions/anthropic-proxy`.
 * The `apiKey` parameter is GONE from the input shape — the bundle holds no
 * Anthropic secrets. The service sends the Anthropic Messages API body as
 * `payload` to the proxy, which allow-lists the model + body fields and forwards.
 *
 * HTTP status codes from the upstream Anthropic response are preserved by the
 * proxy, so the error taxonomy (`auth` / `rate_limit` / `server` / `unknown`)
 * still maps 1:1 to status codes exactly as pre-migration.
 */

import { callProxy } from './anthropicProxy';
import type { EstimateResult, Confidence } from '../types';

const DEFAULT_MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 400;

export const PROMPT_VERSION = 'FLOW_A_ESTIMATE v0.2';

// Canonical prompt. Mirror of docs/prompts.md § FLOW_A_ESTIMATE v0.2 — keep in sync.
const PROMPT_V02 = `You are an expert UK second-hand reseller pricing an item for Vinted UK.

Look at the photo and return ONE compact JSON object with exactly these keys:

{
  "brand": "...",                // brand name exactly as it appears on the label (e.g. "Next", "Primark", "M&S", "Uniqlo", "Zara"). Use "unknown" if genuinely unreadable.
  "category": "...",             // one of: dress, top, t-shirt, shirt, skirt, trousers, jeans, jacket, coat, knitwear, shoes, handbag, accessory, other
  "size": "...",                 // UK size as written on the label (e.g. "10", "M", "40" for EU shoes). "unknown" if unreadable.
  "colour": "...",               // dominant colour, single word (e.g. "navy", "cream", "olive", "burgundy")
  "condition": "...",            // one of: like_new, excellent, good, fair, poor. Judge from the photo (creases, stains, wear).
  "suggestedGbp": 0,             // your best single-point price in GBP for a typical completed Vinted UK sale, reseller-ready.
  "rangeLowGbp": 0,              // the 25th-percentile price (realistic floor — "will definitely sell at this").
  "rangeHighGbp": 0,             // the 75th-percentile price (realistic ceiling for a clean listing + decent photos).
  "confidence": 0.0,             // 0.0-1.0 — your own confidence the identification + pricing are right.
  "reasoningSummary": "..."      // ONE sentence, under 20 words, explaining the suggestedGbp. E.g. "Next midi dresses in size 10 excellent condition typically sell £18–£26 on Vinted UK."
}

Rules:
- Prices in whole pounds (integers). No pence.
- suggestedGbp must sit between rangeLowGbp and rangeHighGbp.
- If you cannot read the brand, still attempt category + size + a price for a generic item in that category.
- Return JSON and nothing else. No prose, no code fences, no trailing commentary.`;

export interface EstimateInput {
  imageBase64: string;
  imageMime: 'image/jpeg' | 'image/png';
  model?: string;
  /** Optional abort signal; forwarded to fetch. */
  signal?: AbortSignal;
}

export class EstimateError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'network' | 'rate_limit' | 'parse' | 'server' | 'timeout' | 'unknown',
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = 'EstimateError';
  }
}

function bucketConfidence(raw: number): Confidence {
  if (raw >= 0.8) return 'high';
  if (raw >= 0.55) return 'medium';
  return 'low';
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Model sometimes wraps JSON in prose despite instructions. Extract first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    throw new EstimateError(
      `Could not parse model response as JSON. Raw head: ${raw.slice(0, 120)}`,
      'parse',
      false,
    );
  }
}

function validateAndNormalise(parsed: Record<string, unknown>): Omit<EstimateResult, 'modelUsed' | 'latencyMs'> {
  const str = (k: string, fallback = 'unknown'): string => {
    const v = parsed[k];
    return typeof v === 'string' && v.length ? v : fallback;
  };
  const num = (k: string, fallback = 0): number => {
    const v = parsed[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };

  let suggestedGbp = Math.round(num('suggestedGbp'));
  let rangeLowGbp = Math.round(num('rangeLowGbp'));
  let rangeHighGbp = Math.round(num('rangeHighGbp'));

  // Defensive: if the model returns a range inverted or with suggested outside it,
  // coerce into a sane shape so the UI never renders nonsense.
  if (rangeLowGbp > rangeHighGbp) [rangeLowGbp, rangeHighGbp] = [rangeHighGbp, rangeLowGbp];
  if (suggestedGbp < rangeLowGbp) suggestedGbp = rangeLowGbp;
  if (suggestedGbp > rangeHighGbp) suggestedGbp = rangeHighGbp;

  const rawConfidence = Math.max(0, Math.min(1, num('confidence')));

  return {
    identification: {
      brand: str('brand'),
      category: str('category'),
      size: str('size'),
      colour: str('colour'),
      condition: str('condition', 'unknown'),
    },
    price: {
      suggestedGbp,
      rangeLowGbp,
      rangeHighGbp,
    },
    confidence: bucketConfidence(rawConfidence),
    rawConfidence,
    reasoningSummary: str('reasoningSummary', ''),
  };
}

function mapProxyStatus(status: number, bodyText: string): EstimateError {
  if (status === 401 || status === 403) {
    // Distinguishes proxy-auth-fail (shared-secret mismatch) from Anthropic-auth-fail.
    const cause = bodyText.includes('proxy_auth_failed') ? 'proxy auth' : 'Anthropic auth';
    return new EstimateError(
      `${cause} failed: ${bodyText.slice(0, 120)}`,
      'auth',
      false,
    );
  }
  if (status === 429) {
    return new EstimateError('Rate-limited. Try again in a moment.', 'rate_limit', true);
  }
  if (status >= 500) {
    return new EstimateError(`Upstream ${status}: ${bodyText.slice(0, 120)}`, 'server', true);
  }
  return new EstimateError(`Upstream ${status}: ${bodyText.slice(0, 120)}`, 'unknown', false);
}

/**
 * Get a Flow A estimate for a single photo.
 *
 * Throws `EstimateError` on network / parse / server / auth failures. Callers (screens) should
 * translate the error kind to a user-facing message.
 */
export async function estimateFromPhoto(input: EstimateInput): Promise<EstimateResult> {
  const model = input.model ?? DEFAULT_MODEL;
  const started = Date.now();

  // Build the Anthropic Messages API body. The proxy allow-lists these fields.
  const payload: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.imageMime,
              data: input.imageBase64,
            },
          },
          { type: 'text', text: PROMPT_V02 },
        ],
      },
    ],
  };

  let res;
  try {
    res = await callProxy({ flow: 'estimate', payload, signal: input.signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new EstimateError(`Network error reaching proxy: ${msg}`, 'network', true);
  }

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    throw mapProxyStatus(res.status, res.bodyText);
  }

  const body = res.bodyJson as { content?: Array<{ text?: string }> } | undefined;
  const text = body?.content?.[0]?.text ?? '';
  if (!text) {
    throw new EstimateError('Upstream returned empty content.', 'parse', false);
  }

  const parsed = safeJsonParse(text);
  const normalised = validateAndNormalise(parsed);

  return {
    ...normalised,
    modelUsed: model,
    latencyMs,
  };
}
