/**
 * Claude-powered listing service — Flow B (Full Listing).
 *
 * Input: identified item (from Flow A) + user ID-Review overrides + selected platforms.
 * Output: a `ListingResult` — per-platform title / description / hashtags for each
 * platform in `selectedPlatforms`.
 *
 * Model: `claude-sonnet-4-6` via Anthropic Messages API (`anthropic-version: 2023-06-01`).
 *   - Pricing: $3 / $15 per MTok input/output [verified 2026-04-20 — benchlm.ai, finout.io].
 *   - ~40% cheaper than Opus 4.7. No vision on this call — Flow A already identified the item.
 *   - Decision record: heuricity-hq/personal/app-machine/decisions.md 2026-04-20 Day-3.
 *
 * Prompt: locked at `FLOW_B_LISTING v0.1` — see `docs/prompts.md`.
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
import type {
  FlowBOverrides,
  ListingResult,
  PlatformKey,
  PlatformListing,
} from '../types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1200;

export const PROMPT_VERSION = 'FLOW_B_LISTING v0.1';

// Platform title caps — verified 2026-04-20. See docs/prompts.md § v0.1 design notes.
const TITLE_CAPS: Record<PlatformKey, number> = {
  vinted: 100,
  depop: 60, // Depop has no documented hard cap; 60 is a best-practice soft cap baked into the prompt
  ebay: 80,
};

const MAX_DEPOP_HASHTAGS = 5;

// Canonical prompt. Mirror of docs/prompts.md § FLOW_B_LISTING v0.1 — keep in sync.
const PROMPT_V01 = `You are an expert UK second-hand reseller writing listings for a single clothing item across multiple platforms.

A prior vision call has already identified the item. You are given the identification, a suggested price, and a list of platforms the seller wants listings for. For each selected platform, produce a polished listing in that platform's idiom.

The input is a compact JSON object (sent in this user message). It contains:
- brand, category, size, colour, condition (one of: like_new, excellent, good, fair, poor)
- suggestedGbp (integer)
- selectedPlatforms (array, each one of "vinted" / "depop" / "ebay")

Return ONE compact JSON object. Include ONLY the platform keys that appear in selectedPlatforms. Schema:

{
  "vinted"?: {
    "title": "<string, MAX 100 chars, lead with brand + category + size + condition; keyword-dense but readable>",
    "description": "<string, plain text, Vinted UK conventions: opens with a one-line summary, then brand / size / condition / fit / care / postage; no hashtags; no emojis>"
  },
  "depop"?: {
    "title": "<string, short and punchy, under 60 chars; brand + style vibe>",
    "description": "<string, casual vibe-led one-to-two-paragraphs, mention fit + vibe; end with a single-line block of hashtags each prefixed with #>",
    "hashtags": ["<array of up to 5 lowercase strings WITHOUT the # sign, e.g. 'y2k', 'vintage', 'minimalist'>"]
  },
  "ebay"?: {
    "title": "<string, MAX 80 chars; keyword-dense in SEO order: brand + category + specific descriptors + size + colour + condition>",
    "description": "<string, structured: first paragraph is a keyword-dense summary; subsequent lines are bullet-style item specifics: brand, size, colour, material if inferable, condition, postage>"
  }
}

Rules:
- Titles must respect the character caps (Vinted 100, Depop ~60, eBay 80). Count characters including spaces.
- Descriptions should read naturally, not like spam. Use the condition level to shape tone: "like_new" = confident; "fair" = honest about flaws.
- If brand is "unknown", write a generic category-led listing without claiming a brand.
- Hashtags (Depop only) must be lowercase, no "#" sign in the array (the UI adds them), at most 5, relevant to the specific item (style era, category, vibe — NOT generic "depop" / "forsale" tags).
- Include ONLY the platform keys listed in selectedPlatforms. If "vinted" is not selected, do NOT include a "vinted" key.
- Return JSON and nothing else. No prose, no code fences, no trailing commentary.`;

export interface ListingInput {
  /** Identification values as confirmed on the ID Review screen (Flow A values + user overrides). */
  identification: {
    brand: string;
    category: string;
    size: string;
    colour: string;
    condition: string;
  };
  overrides?: FlowBOverrides; // optional — if supplied, merged over identification at the service boundary
  suggestedGbp: number;
  selectedPlatforms: PlatformKey[];
  model?: string;
  /** Optional abort signal; forwarded to fetch. */
  signal?: AbortSignal;
}

export class ListingError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'auth'
      | 'network'
      | 'rate_limit'
      | 'parse'
      | 'server'
      | 'timeout'
      | 'validation'
      | 'unknown',
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = 'ListingError';
  }
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Model occasionally wraps JSON in prose despite instructions. Extract first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    throw new ListingError(
      `Could not parse model response as JSON. Raw head: ${raw.slice(0, 160)}`,
      'parse',
      false,
    );
  }
}

/**
 * Defensive per-platform coercion.
 *
 * Given a raw platform sub-object from the model, returns a PlatformListing with:
 *   - title trimmed to the platform's cap (never throws — clipping is safer than rejecting)
 *   - description as-is (empty string fallback)
 *   - hashtags clipped to at most 5, stripped of '#' prefix, lowercased
 *
 * Returns null if the sub-object is structurally unusable (no title AND no description).
 */
function normalisePlatform(
  raw: unknown,
  platform: PlatformKey,
): PlatformListing | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const titleRaw = typeof obj.title === 'string' ? obj.title.trim() : '';
  const descriptionRaw = typeof obj.description === 'string' ? obj.description.trim() : '';

  if (!titleRaw && !descriptionRaw) return null;

  const cap = TITLE_CAPS[platform];
  const title = titleRaw.length > cap ? titleRaw.slice(0, cap).trim() : titleRaw;

  const listing: PlatformListing = { title, description: descriptionRaw };

  if (platform === 'depop' && Array.isArray(obj.hashtags)) {
    const tags = (obj.hashtags as unknown[])
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, MAX_DEPOP_HASHTAGS);
    if (tags.length) listing.hashtags = tags;
  }

  return listing;
}

function mapProxyStatus(status: number, bodyText: string): ListingError {
  if (status === 401 || status === 403) {
    // Distinguishes proxy-auth-fail (shared-secret mismatch) from Anthropic-auth-fail.
    const cause = bodyText.includes('proxy_auth_failed') ? 'proxy auth' : 'Anthropic auth';
    return new ListingError(
      `${cause} failed: ${bodyText.slice(0, 160)}`,
      'auth',
      false,
    );
  }
  if (status === 429) {
    return new ListingError('Rate-limited. Try again in a moment.', 'rate_limit', true);
  }
  if (status >= 500) {
    return new ListingError(`Upstream ${status}: ${bodyText.slice(0, 160)}`, 'server', true);
  }
  return new ListingError(`Upstream ${status}: ${bodyText.slice(0, 160)}`, 'unknown', false);
}

/**
 * Build the user-message JSON the prompt expects.
 * Overrides (from ID Review) win over base identification.
 */
function buildUserPayload(input: ListingInput): string {
  const merged = { ...input.identification, ...(input.overrides ?? {}) };
  const payload = {
    brand: merged.brand,
    category: merged.category,
    size: merged.size,
    colour: merged.colour,
    condition: merged.condition,
    suggestedGbp: input.suggestedGbp,
    selectedPlatforms: input.selectedPlatforms,
  };
  return JSON.stringify(payload);
}

/**
 * Get per-platform listings for one scan.
 *
 * Throws `ListingError` on network / parse / server / auth / validation failures.
 * Per-platform partial failures (model returned some but not all requested platforms,
 * OR a specific platform sub-object was unusable) are returned in the result's
 * `partialErrors` array. Callers (screens) decide how to surface each case.
 */
export async function generateListing(input: ListingInput): Promise<ListingResult> {
  if (input.selectedPlatforms.length === 0) {
    throw new ListingError(
      'At least one platform must be selected.',
      'validation',
      false,
    );
  }

  const model = input.model ?? DEFAULT_MODEL;
  const userPayload = buildUserPayload(input);
  const started = Date.now();

  // Build the Anthropic Messages API body. The proxy allow-lists these fields.
  const payload: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    system: PROMPT_V01,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userPayload }],
      },
    ],
  };

  let res;
  try {
    res = await callProxy({ flow: 'listing', payload, signal: input.signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ListingError(`Network error reaching proxy: ${msg}`, 'network', true);
  }

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    throw mapProxyStatus(res.status, res.bodyText);
  }

  const body = res.bodyJson as { content?: Array<{ text?: string }> } | undefined;
  const text = body?.content?.[0]?.text ?? '';
  if (!text) {
    throw new ListingError('Upstream returned empty content.', 'parse', false);
  }

  const parsed = safeJsonParse(text);

  // Per-platform defensive parse.
  const result: ListingResult = {
    modelUsed: model,
    latencyMs,
  };
  const partialErrors: PlatformKey[] = [];

  for (const platform of input.selectedPlatforms) {
    const raw = parsed[platform];
    const listing = normalisePlatform(raw, platform);
    if (listing) {
      result[platform] = listing;
    } else {
      partialErrors.push(platform);
    }
  }

  if (partialErrors.length === input.selectedPlatforms.length) {
    // Model returned a JSON object but nothing usable for any requested platform.
    throw new ListingError(
      `Model response contained no usable platform listings. Head: ${text.slice(0, 160)}`,
      'parse',
      true,
    );
  }

  if (partialErrors.length > 0) {
    result.partialErrors = partialErrors;
  }

  return result;
}
