/**
 * HomeScreen — single "Scan" CTA + scan counter + preview-pricing footer.
 *
 * Day 3 collapse (decisions.md 2026-04-20 Day-3): Flow A and Flow B share the entire
 * first leg (Camera → Loading → Price Reveal). Flow B is an opt-in upgrade from the
 * Price Reveal screen's "Make a listing" CTA, not a separate Home entry. The prior
 * two-CTA Home implied a false separation.
 *
 * Day 4: settings gear top-right wired to Settings screen. Scan button guards against
 * the free-tier cap — free users past the cap are bounced to the paywall instead of
 * kicking off the camera.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { useStore } from '../state/store';
import { CoralButton } from '../components/CoralButton';
import { PreviewBadge } from '../components/PreviewBadge';
import { PreviewPricingModal } from '../components/PreviewPricingModal';

// Per-plan daily scan caps. Source of truth mirrored server-side in the
// anthropic-proxy Edge Function on Day 5.
const DAILY_SCAN_CAP_FREE = 3;
const DAILY_SCAN_CAP_PRO = 100;

export function HomeScreen() {
  const startFlow = useStore((s) => s.startFlow);
  const openPaywall = useStore((s) => s.openPaywall);
  const openSettings = useStore((s) => s.openSettings);
  const scansUsedToday = useStore((s) => s.scansUsedToday);
  const plan = useStore((s) => s.plan);
  const [previewOpen, setPreviewOpen] = useState(false);

  const cap =
    plan === 'pro_plus'
      ? Number.POSITIVE_INFINITY
      : plan === 'pro'
        ? DAILY_SCAN_CAP_PRO
        : DAILY_SCAN_CAP_FREE;

  const scansLeft =
    cap === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.max(0, cap - scansUsedToday);

  const scanCounterText =
    plan === 'pro_plus'
      ? 'Unlimited scans · Pro Plus'
      : scansLeft > 0
        ? `${scansLeft} scan${scansLeft === 1 ? '' : 's'} left today · ${planLabel(plan)}`
        : `You're out of scans for today · tap Scan to upgrade`;

  const handleScanPress = () => {
    // Free-tier guard. Cap exhausted → paywall instead of camera.
    if (plan === 'free' && scansUsedToday >= DAILY_SCAN_CAP_FREE) {
      void Haptics.selectionAsync();
      openPaywall();
      return;
    }
    if (plan === 'pro' && scansUsedToday >= DAILY_SCAN_CAP_PRO) {
      void Haptics.selectionAsync();
      openPaywall();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startFlow('A');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            onPress={openSettings}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.gearHit}
          >
            <Text style={styles.gear}>⚙</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <View style={styles.dot} />
          <Text style={styles.wordmark}>worthit</Text>
          <Text style={styles.tagline}>
            Point at any item. Get a price. Turn it into a listing if you want.
          </Text>
        </View>

        <View style={styles.ctas}>
          <CoralButton
            label="Scan an item"
            subLabel="Tap the shutter. We'll tell you what it's worth."
            variant="primary"
            onPress={handleScanPress}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.scanCounter}>{scanCounterText}</Text>
          <PreviewBadge onPress={() => setPreviewOpen(true)} />
        </View>
      </View>
      <PreviewPricingModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </SafeAreaView>
  );
}

function planLabel(plan: 'free' | 'pro' | 'pro_plus'): string {
  if (plan === 'pro') return 'Pro';
  if (plan === 'pro_plus') return 'Pro Plus';
  return 'Free';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  gearHit: {
    padding: spacing.sm,
  },
  gear: {
    color: colors.paperDim,
    fontSize: 22,
    fontWeight: '500',
  },
  header: { marginTop: spacing.lg, gap: spacing.sm },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coral,
    marginBottom: spacing.sm,
  },
  wordmark: {
    color: colors.paper,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  tagline: {
    color: colors.muteLight,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  ctas: { gap: spacing.md },
  footer: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
  scanCounter: {
    color: colors.mute,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
