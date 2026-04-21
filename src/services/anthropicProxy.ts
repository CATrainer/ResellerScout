/**
 * anthropicProxy — RN client for the Supabase Edge Function proxy.
 *
 * All Anthropic traffic from the app goes through here. The function holds the
 * real Anthropic key in Supabase project secrets; the bundle ships only the
 * proxy URL + shared-secret header (bounded blast radius).
 *
 * Two call sites:
 *  - `claudeEstimateService.estimateFromPhoto` — flow: 'estimate'
 *  - `claudeListingService.generateListing`    — flow: 'listing'
 *
 * The caller constructs the Anthropic Messages API body (model, max_tokens, system,
 * messages) and passes it as `payload`. The proxy allow-lists model names and body
 * fields, forwards to Anthropic, and pipes back the response with the original
 * status code so the caller's HTTP-status-based error taxonomy still works.
 *
 * See supabase/functions/anthropic-proxy/index.ts for the server side of this contract.
 */

import { appEnv } from '../config/env';

export interface ProxyResponse {
  /** Original HTTP status from the upstream (or from the proxy on misconfig / auth fail). */
  status: number;
  /** `true` if status is 2xx. */
  ok: boolean;
  /** Raw response body text — caller JSON-parses (defensive against non-JSON upstream errors). */
  bodyText: string;
  /** Parsed JSON if body is valid JSON, else undefined. Convenience wrapper over bodyText. */
  bodyJson: unknown | undefined;
}

export type ProxyFlow = 'estimate' | 'listing';

export interface CallProxyInput {
  flow: ProxyFlow;
  /**
   * The full Anthropic Messages API request body. The proxy allow-lists specific
   * fields (model, max_tokens, system, messages, temperature, stop_sequences).
   * Anything else is silently dropped on the server side.
   */
  payload: Record<string, unknown>;
  /** Optional abort signal passed through to fetch. */
  signal?: AbortSignal;
}

/**
 * Low-level proxy call. Returns status + body text (and parsed JSON where possible)
 * without throwing on non-2xx. Callers map status codes to their own error taxonomies
 * (`EstimateError`, `ListingError`) so the service-layer error kinds stay stable.
 *
 * Throws only on:
 *   - Network failure (caller maps to 'network' / retriable)
 *   - Missing / empty bundle env (caller maps to 'auth' / non-retriable — configuration bug)
 */
export async function callProxy(input: CallProxyInput): Promise<ProxyResponse> {
  const url = appEnv.proxyUrl();
  const anonKey = appEnv.supabaseAnonKey();
  const sharedSecret = appEnv.proxySharedSecret();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Supabase Edge Functions default to requiring a valid JWT. The anon key
      // is a JWT with the `anon` role — safe to ship in the bundle.
      Authorization: `Bearer ${anonKey}`,
      // Defence-in-depth. Matches PROXY_SHARED_SECRET on the Edge Function.
      'x-proxy-secret': sharedSecret,
    },
    body: JSON.stringify({ flow: input.flow, payload: input.payload }),
    signal: input.signal,
  });

  const bodyText = await res.text();
  let bodyJson: unknown | undefined;
  try {
    bodyJson = bodyText.length ? JSON.parse(bodyText) : undefined;
  } catch {
    bodyJson = undefined;
  }

  return {
    status: res.status,
    ok: res.ok,
    bodyText,
    bodyJson,
  };
}
