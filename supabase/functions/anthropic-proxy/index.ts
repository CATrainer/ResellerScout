/**
 * anthropic-proxy — Supabase Edge Function.
 *
 * Holds the Anthropic API key off the app bundle. Accepts a flow-tagged payload from
 * the RN client and forwards the right Anthropic Messages API request.
 *
 * ============================================================================
 * Why this exists (Day-4 motivation)
 * ============================================================================
 * Day 2–3 shipped the app with `EXPO_PUBLIC_ANTHROPIC_API_KEY` in the bundle. Any
 * user who strings the binary could extract it and rack up unbounded Anthropic
 * bills on our account. Apple's review team treats this as a disqualifying
 * submission issue. The blast radius of a successful bundle-extraction is
 * unbounded Anthropic spend — there is no ceiling.
 *
 * Moving the call behind this proxy:
 *   - The Anthropic key never leaves Supabase project secrets.
 *   - The blast radius shrinks from "unbounded Anthropic spend" to "bounded
 *     proxy invocations capped by Supabase free-tier + Anthropic org rate limits."
 *   - Day 5 layers per-user JWT auth + server-side scan-cap enforcement on top.
 *
 * ============================================================================
 * Day-4 authentication model (shared-secret mode)
 * ============================================================================
 * Two layers:
 *   1. `Authorization: Bearer <SUPABASE_ANON_KEY>` — satisfies Supabase's default
 *      JWT gate. Anon key is safe to ship in the bundle (that's its purpose).
 *   2. `x-proxy-secret: <PROXY_SHARED_SECRET>` — our defence-in-depth. Set via
 *      `supabase secrets set PROXY_SHARED_SECRET=<value>` then added to the RN
 *      bundle as `EXPO_PUBLIC_PROXY_SHARED_SECRET`. Same bundle-extraction risk
 *      as before BUT the blast radius is now bounded (see above).
 *
 * Day-5 upgrade path: when Supabase Auth lands in the RN app (Apple Sign-In),
 * this function will:
 *   - Read `auth.uid()` from the verified JWT.
 *   - INSERT into `rate_limits` with ON CONFLICT to atomic-increment the
 *     per-user daily counter, returning the new count.
 *   - Reject with 429 if the user's plan ceiling is hit (Free=3, Pro=100,
 *     Pro Plus=unlimited).
 *   - Keep the shared-secret check as belt-and-braces.
 *
 * ============================================================================
 * Model allow-list
 * ============================================================================
 * The proxy only forwards requests for Claude models we actually use. An attacker
 * who obtained the bundle secret cannot use the proxy to drive arbitrary Claude
 * calls at our expense.
 *
 * Updated when we add new models — keep in sync with `claudeEstimateService.ts`
 * (DEFAULT_MODEL) and `claudeListingService.ts` (DEFAULT_MODEL).
 *
 * ============================================================================
 * Error shape contract with the client
 * ============================================================================
 * The RN client's `EstimateError` and `ListingError` taxonomies depend on specific
 * HTTP status codes. We preserve them:
 *   - 401/403  → client maps to `auth`
 *   - 429      → client maps to `rate_limit`
 *   - 5xx      → client maps to `server`
 *   - 4xx (other) → client maps to `unknown`
 * On proxy-side auth failures (shared secret mismatch) we return 401 so the
 * existing client branch fires — the message distinguishes the cause.
 *
 * ============================================================================
 * Deploy
 * ============================================================================
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... PROXY_SHARED_SECRET=<random>
 *   supabase functions deploy anthropic-proxy
 *
 * Run log: Supabase Dashboard → Edge Functions → anthropic-proxy → Logs.
 *
 * ============================================================================
 * FSD tags
 * ============================================================================
 *   - Supabase Edge Functions run on Deno (2.1+) with npm support. `[verified 2026-04-20]`
 *   - Edge Functions free tier: 500K invocations/month, $2/M overage. `[verified 2026-04-20]`
 *   - Anthropic Messages API endpoint + auth headers stable since 2023-06-01. `[verified 2026-04-20]`
 */

// Deno std HTTP handler. `Deno.serve` is the idiomatic Supabase Edge Function shape.
// Supabase's edge-runtime supports both Deno std and the newer `Deno.serve`.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Models we are prepared to forward. Update when adding a new call site.
const ALLOWED_MODELS = new Set<string>([
  'claude-opus-4-7',    // Flow A — vision + price reasoning
  'claude-sonnet-4-6',  // Flow B — text-only listing generation; Flow A tier-2 fallback
]);

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Narrow the body we pass to Anthropic. Anything outside this allow-list is dropped.
const ALLOWED_BODY_KEYS = new Set<string>([
  'model',
  'max_tokens',
  'system',
  'messages',
  'temperature', // currently unused but safe to allow
  'stop_sequences',
]);

type Flow = 'estimate' | 'listing';

interface ProxyRequest {
  flow: Flow;
  payload: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isProxyRequest(x: unknown): x is ProxyRequest {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.flow !== 'estimate' && o.flow !== 'listing') return false;
  if (!o.payload || typeof o.payload !== 'object') return false;
  return true;
}

function sanitisePayload(
  payload: Record<string, unknown>,
): { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const model = payload.model;
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return { ok: false, reason: `model "${String(model)}" not in allow-list` };
  }
  if (typeof payload.max_tokens !== 'number' || payload.max_tokens <= 0) {
    return { ok: false, reason: 'max_tokens missing or non-positive' };
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { ok: false, reason: 'messages missing or empty' };
  }

  const body: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (ALLOWED_BODY_KEYS.has(key)) body[key] = payload[key];
  }
  return { ok: true, body };
}

// deno-lint-ignore no-explicit-any
(globalThis as any).Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight — RN native fetch doesn't hit this, but dev web does.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization, content-type, x-proxy-secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // ---- 1. Shared-secret check (defence-in-depth) ----
  // deno-lint-ignore no-explicit-any
  const expectedSecret = (globalThis as any).Deno.env.get('PROXY_SHARED_SECRET') as
    | string
    | undefined;
  if (!expectedSecret) {
    // Fail closed if the server is misconfigured.
    return json({ error: 'proxy_misconfigured' }, 500);
  }
  const providedSecret = req.headers.get('x-proxy-secret');
  if (providedSecret !== expectedSecret) {
    // 401 so the client maps this to its `auth` error branch — the message
    // string makes it clear this is proxy-side, not Anthropic-side.
    return json({ error: 'proxy_auth_failed' }, 401);
  }

  // ---- 2. Anthropic key (server-side secret) ----
  // deno-lint-ignore no-explicit-any
  const anthropicKey = (globalThis as any).Deno.env.get('ANTHROPIC_API_KEY') as
    | string
    | undefined;
  if (!anthropicKey) {
    return json({ error: 'anthropic_key_missing' }, 500);
  }

  // ---- 3. Parse + validate request ----
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!isProxyRequest(parsed)) {
    return json({ error: 'invalid_request_shape' }, 400);
  }

  const sanitised = sanitisePayload(parsed.payload as Record<string, unknown>);
  if (!sanitised.ok) {
    return json({ error: `invalid_payload: ${sanitised.reason}` }, 400);
  }

  // ---- 4. Forward to Anthropic ----
  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(sanitised.body),
    });
  } catch (e) {
    // Network error to Anthropic — surface as 502 so client maps to `server` (retriable).
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'upstream_unreachable', detail: msg.slice(0, 200) }, 502);
  }

  // ---- 5. Pipe response back. Preserve status code so client error branches fire. ----
  // We read the body as text (not json) so non-json upstream errors aren't mangled.
  const bodyText = await upstream.text();
  return new Response(bodyText, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      // CORS for web dev; RN native fetch ignores.
      'Access-Control-Allow-Origin': '*',
    },
  });
});
