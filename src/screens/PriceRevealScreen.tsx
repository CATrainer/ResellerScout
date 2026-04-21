/**
 * PriceRevealScreen — shared terminal for Flow A, entry point for Flow B.
 *
 * Shows the PriceCard, a confidence pill, primary "Scan another" CTA, "Make a listing"
 * CTA (wired Day 3 — upgrades the current scan into Flow B without double-counting),
 * and the persistent preview-pricing badge.
 *
 * Scan-counter guard: on first successful render of a session, calls `markScanCounted()`
 * exactly once. Upgrading to Flow B re-enters this screen via back-nav does NOT re-count,
 * because the guard is `scanCountedThisSession` in the store.
 *
 * If the store holds an error instead of an estimate, render a minimal error state with a retry.
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { CoralButton } from '../components/CoralButton';
import { PreviewBadge } from '../components/PreviewBadge';
import { PreviewPricingModal } from '../components/PreviewPricingModal';
import { PriceCard } from '../components/PriceCard';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';

// Free tier daily cap. Mirrored in HomeScreen + (Day-5) in the Edge Function.
const DAILY_SCAN_CAP_FREE = 3;

export function PriceRevealScreen() {
  const estimate = useStore((s) => s.estimate);
  const error = useStore((s) => s.error);
  const imageUri = useStore((s) => s.imageUri);
  const goHome = useStore((s) => s.goHome);
  const startFlow = useStore((s) => s.startFlow);
  const upgradeToFlowB = useStore((s) => s.upgradeToFlowB);
  const markScanCounted = useStore((s) => s.markScanCounted);
  const plan = useStore((s) => s.plan);
  const scansUsedToday = useStore((s) => s.scansUsedToday);
  const openPaywall = useStore((s) => s.openPaywall);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Decrement the free-tier counter exactly once per scan-session. The store-level
  // `scanCountedThisSession` guard makes re-entry from Flow B back-nav a no-op.
  // Fire a light haptic on the reveal — the price landing is the money moment.
  useEffect(() => {
    if (estimate && !error) {
      markScanCounted();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [estimate, error, markScanCounted]);

  // "Scan another" on a free-tier user who has exhausted their cap bounces to the
  // paywall instead of kicking off a new scan. Day-4 client-side check; Day-5
  // replaces with a server-authoritative 429 from the Edge Function.
  const handleScanAnother = () => {
    if (plan === 'free' && scansUsedToday >= DAILY_SCAN_CAP_FREE) {
      void Haptics.selectionAsync();
      openPaywall();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startFlow('A');
  };

  const handleMakeListing = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    upgradeToFlowB();
  };

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>That didn't land</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.actions}>
            <CoralButton label="Try again" variant="primary" onPress={() => startFlow('A')} />
            <CoralButton label="Back home" variant="outline" size="md" onPress={goHome} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!estimate) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>We lost the scan</Text>
          <Text style={styles.errorBody}>Head back and try it again.</Text>
          <CoralButton label="Back home" variant="outline" size="md" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>The price</Text>
          <Text style={styles.title}>Here's what we reckon</Text>
        </View>

        <PriceCard estimate={estimate} imageUri={imageUri ?? ''} />

        {estimate.reasoningSummary ? (
          <View style={styles.whyBlock}>
            <Text style={styles.whyLabel}>Why this price</Text>
            <Text style={styles.whyText}>{estimate.reasoningSummary}</Text>
          </View>
        ) : null}

        <View style={styles.latencyRow}>
          <Text style={styles.latencyText}>
            Scanned in {(estimate.latencyMs / 1000).toFixed(1)}s
            {__DEV__ ? ` · ${estimate.modelUsed}` : ''}
          </Text>
        </View>

        <View style={styles.actions}>
          <CoralButton
            label="Turn this into a listing"
            subLabel="We'll write the title, description and hashtags for Vinted, Depop and eBay."
            variant="primary"
            onPress={handleMakeListing}
          />
          <CoralButton
            label="Scan another item"
            variant="outline"
            size="md"
            onPress={handleScanAnother}
          />
        </View>

        <View style={styles.footer}>
          <PreviewBadge onPress={() => setPreviewOpen(true)} />
        </View>
      </ScrollView>
      <PreviewPricingModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs, marginTop: spacing.md },
  eyebrow: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { color: colors.paper, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  whyBlock: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
  },
  whyLabel: {
    color: colors.muteLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  whyText: { color: colors.paper, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  latencyRow: { alignItems: 'center' },
  latencyText: { color: colors.mute, fontSize: 11, fontFamily: 'Menlo', letterSpacing: 0.3 },
  actions: { gap: spacing.md },
  footer: { alignItems: 'center', marginTop: spacing.md },
  errorWrap: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorTitle: { color: colors.paper, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  errorBody: { color: colors.muteLight, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
});
