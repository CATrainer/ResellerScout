/**
 * PlatformPickScreen — Flow B screen 2 of 3.
 *
 * Multi-select platform picker. All three (Vinted / Depop / eBay) selected by default
 * (decision: decisions.md 2026-04-20 Day-3). At least one must remain selected to enable
 * "Generate listing".
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CoralButton } from '../components/CoralButton';
import { PlatformChip } from '../components/PlatformChip';
import { PreviewBadge } from '../components/PreviewBadge';
import { TagChip } from '../components/TagChip';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';
import type { PlatformKey } from '../types';

const PLATFORMS: Array<{ key: PlatformKey; label: string; blurb: string }> = [
  { key: 'vinted', label: 'Vinted', blurb: 'Brand and size up top. Plain copy.' },
  { key: 'depop', label: 'Depop', blurb: 'Casual, hashtag-heavy, aesthetic first.' },
  { key: 'ebay', label: 'eBay', blurb: 'Keyword-packed title, buyer-search shaped.' },
];

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCondition(c?: string): string {
  if (!c) return '—';
  return c
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export function PlatformPickScreen() {
  const estimate = useStore((s) => s.estimate);
  const overrides = useStore((s) => s.idOverrides);
  const selected = useStore((s) => s.selectedPlatforms);
  const togglePlatform = useStore((s) => s.togglePlatform);
  const startListingCall = useStore((s) => s.startListingCall);
  const upgradeToFlowB = useStore((s) => s.upgradeToFlowB);

  if (!estimate) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Nothing to list yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleTogglePlatform = (key: PlatformKey) => {
    void Haptics.selectionAsync();
    togglePlatform(key);
  };

  const handleGenerate = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startListingCall();
  };

  const handleBack = () => {
    void Haptics.selectionAsync();
    upgradeToFlowB();
  };

  const merged = {
    brand: overrides.brand ?? estimate.identification.brand,
    category: estimate.identification.category,
    size: overrides.size ?? estimate.identification.size,
    colour: estimate.identification.colour,
    condition: overrides.condition ?? estimate.identification.condition ?? 'good',
  };

  const canContinue = selected.length > 0;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Listing · Step 2 of 3</Text>
          <Text style={styles.title}>Where are you listing?</Text>
          <Text style={styles.sub}>
            We'll tailor a listing for each one you pick. Drop any you don't use.
          </Text>
        </View>

        {/* Item summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryPrice}>£{estimate.price.suggestedGbp}</Text>
          <Text style={styles.summaryTitle}>
            {titleCase(merged.brand)} {merged.category} · {merged.size}
          </Text>
          <View style={styles.summaryTags}>
            <TagChip label={titleCase(merged.colour)} />
            <TagChip label={formatCondition(merged.condition)} tone="accent" />
          </View>
        </View>

        {/* Platform chips */}
        <View style={styles.platformGrid}>
          {PLATFORMS.map((p) => {
            const isSelected = selected.includes(p.key);
            return (
              <View key={p.key} style={styles.platformCard}>
                <PlatformChip
                  label={p.label}
                  selected={isSelected}
                  onPress={() => handleTogglePlatform(p.key)}
                />
                <Text style={styles.platformBlurb}>{p.blurb}</Text>
              </View>
            );
          })}
        </View>

        {!canContinue && (
          <Text style={styles.warning}>Pick at least one platform to continue.</Text>
        )}

        <View style={styles.actions}>
          <CoralButton
            label="Write my listings"
            subLabel={
              selected.length === 1
                ? `1 platform · ${PLATFORMS.find((p) => p.key === selected[0])?.label}`
                : `${selected.length} platforms at once`
            }
            variant={canContinue ? 'primary' : 'disabled'}
            onPress={canContinue ? handleGenerate : undefined}
          />
          <CoralButton label="Back" variant="outline" size="md" onPress={handleBack} />
        </View>

        <View style={styles.footer}>
          <PreviewBadge />
        </View>
      </ScrollView>
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
  sub: { color: colors.muteLight, fontSize: 13, lineHeight: 18 },

  summary: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
  },
  summaryPrice: {
    color: colors.paper,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    fontFamily: 'Menlo',
  },
  summaryTitle: { color: colors.paperDim, fontSize: 15, fontWeight: '500' },
  summaryTags: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },

  platformGrid: { gap: spacing.md },
  platformCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  platformBlurb: {
    flex: 1,
    color: colors.muteLight,
    fontSize: 12,
    lineHeight: 16,
  },

  warning: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  actions: { gap: spacing.md, marginTop: spacing.md },
  footer: { alignItems: 'center', marginTop: spacing.md },
  errorWrap: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  errorTitle: { color: colors.paper, fontSize: 22, fontWeight: '700' },
});
