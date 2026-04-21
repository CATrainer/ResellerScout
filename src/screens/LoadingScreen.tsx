/**
 * LoadingScreen — cycling copy + brand loader.
 *
 * Shared between Flow A (estimate) and Flow B (listing). Mode is picked from the
 * store's `loadingMode` — set to `'estimate'` on camera-capture and to `'listing'`
 * when the user presses "Generate listing" on Platform Pick.
 *
 * Flow A copy cycle (every 1.4 s):
 *   "Taking a look…" → "Working out a price…"
 * Flow B copy cycle (every 1.4 s):
 *   "Writing your listings…" → "Tightening the titles…" → "Picking hashtags…"
 *
 * Slow-bar kicks in at:
 *   - 3 s for estimate mode (Flow A metric bar)
 *   - 15 s for listing mode (Flow B metric bar is <20s end-to-end; the inner call
 *     lands around 8–12 s in the happy path, so 15 s is genuinely late)
 *
 * When this screen mounts, it kicks off the right service. On success: set result,
 * which switches us to the next screen. On failure: setError, which routes back to
 * priceReveal (estimate mode) or listing (listing mode) — see store.setError.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { BrandLoader } from '../components/BrandLoader';
import {
  EstimateError,
  estimateFromPhoto,
} from '../services/claudeEstimateService';
import {
  ListingError,
  generateListing,
} from '../services/claudeListingService';
import { useStore } from '../state/store';
import { colors, spacing } from '../theme';

const CYCLE_MS = 1400;
const SLOW_BAR_ESTIMATE_MS = 3000;
const SLOW_BAR_LISTING_MS = 15000;

const ESTIMATE_COPY: string[] = ['Taking a look…', 'Working out a price…'];
const LISTING_COPY: string[] = [
  'Writing your listings…',
  'Tightening the titles…',
  'Picking hashtags…',
];

export function LoadingScreen() {
  const mode = useStore((s) => s.loadingMode);
  const imageBase64 = useStore((s) => s.imageBase64);
  const imageMime = useStore((s) => s.imageMime);
  const estimate = useStore((s) => s.estimate);
  const idOverrides = useStore((s) => s.idOverrides);
  const selectedPlatforms = useStore((s) => s.selectedPlatforms);
  const setEstimate = useStore((s) => s.setEstimate);
  const setListing = useStore((s) => s.setListing);
  const setError = useStore((s) => s.setError);
  const goHome = useStore((s) => s.goHome);

  const copyArr = mode === 'listing' ? LISTING_COPY : ESTIMATE_COPY;
  const slowMs = mode === 'listing' ? SLOW_BAR_LISTING_MS : SLOW_BAR_ESTIMATE_MS;

  const [copyIdx, setCopyIdx] = useState(0);
  const [slow, setSlow] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => setCopyIdx((i) => (i + 1) % copyArr.length), CYCLE_MS);
    const slowTimer = setTimeout(() => setSlow(true), slowMs);
    return () => {
      clearInterval(iv);
      clearTimeout(slowTimer);
    };
  }, [copyArr.length, slowMs]);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      if (mode === 'listing') {
        if (!estimate) {
          setError("We lost your scan. Start fresh from the home screen.");
          return;
        }
        if (selectedPlatforms.length === 0) {
          setError('Pick at least one platform to continue.');
          return;
        }
        try {
          const result = await generateListing({
            identification: {
              brand: idOverrides.brand ?? estimate.identification.brand,
              category: estimate.identification.category,
              size: idOverrides.size ?? estimate.identification.size,
              colour: estimate.identification.colour,
              condition:
                idOverrides.condition ??
                estimate.identification.condition ??
                'good',
            },
            suggestedGbp: estimate.price.suggestedGbp,
            selectedPlatforms,
          });
          setListing(result);
        } catch (e) {
          const msg =
            e instanceof ListingError
              ? friendlyListingError(e)
              : e instanceof Error
                ? e.message
                : "Something didn't land right. Try again?";
          setError(msg);
        }
        return;
      }

      // Default: estimate mode (Flow A).
      if (!imageBase64 || !imageMime) {
        setError("We didn't catch that photo. Try again?");
        return;
      }
      try {
        const result = await estimateFromPhoto({
          imageBase64,
          imageMime,
        });
        setEstimate(result);
      } catch (e) {
        const msg =
          e instanceof EstimateError
            ? friendlyEstimateError(e)
            : e instanceof Error
              ? e.message
              : "Something didn't land right. Try again?";
        setError(msg);
      }
    })();
  }, [
    mode,
    imageBase64,
    imageMime,
    estimate,
    idOverrides,
    selectedPlatforms,
    setEstimate,
    setListing,
    setError,
  ]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.inner}>
        <BrandLoader size={56} />
        <Text style={styles.copy}>{copyArr[copyIdx]}</Text>
        {slow && (
          <Text style={styles.slowCopy}>Still working. Give it a sec.</Text>
        )}
      </View>
      <Pressable style={styles.cancel} onPress={goHome}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function friendlyEstimateError(e: EstimateError): string {
  switch (e.kind) {
    case 'auth':
      // Post-Day-4: auth errors are proxy-side (shared-secret) or Anthropic-side.
      // Both are config bugs — surface the full message in dev; friendly in prod.
      return __DEV__
        ? `Auth failed: ${e.message}`
        : "Something's off on our end. Try again in a minute.";
    case 'rate_limit':
      return "A lot of people are scanning right now. Give it a sec and try again.";
    case 'network':
      return "Can't reach the internet. Check your connection?";
    case 'server':
      return "Our end had a wobble. One more go?";
    case 'parse':
      return "We got a strange answer back. Try again?";
    case 'timeout':
      return "That took too long. Try again?";
    default:
      return e.message;
  }
}

function friendlyListingError(e: ListingError): string {
  switch (e.kind) {
    case 'auth':
      return __DEV__
        ? `Auth failed: ${e.message}`
        : "Something's off on our end. Try again in a minute.";
    case 'rate_limit':
      return "A lot of people are using this right now. Give it a sec and try again.";
    case 'network':
      return "Can't reach the internet. Check your connection?";
    case 'server':
      return "Our end had a wobble. One more go?";
    case 'parse':
      return "The listing came back a bit scrambled. Tap regenerate?";
    case 'validation':
      return e.message;
    case 'timeout':
      return "That took too long. Try again?";
    default:
      return e.message;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  copy: { color: colors.paper, fontSize: 18, fontWeight: '500', letterSpacing: -0.2 },
  slowCopy: {
    color: colors.muteLight,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  cancel: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  cancelText: { color: colors.mute, fontSize: 14, fontWeight: '500' },
});
