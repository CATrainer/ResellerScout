/**
 * ListingScreen — Flow B screen 3 of 3, terminal.
 *
 * Tabs across platforms; per-tab view shows title + description (+ hashtags for Depop).
 * "Copy everything & open [platform]" copies the concatenated text to the clipboard and
 * fires the iOS share sheet with the scanned image.
 *
 * Per-platform partial failures render an inline retry affordance inside the failed tab —
 * the other tabs remain usable.
 *
 * "Mark as posted" is Day 4/5 work (Supabase `listings.posted_to_*`).
 */

import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CoralButton } from '../components/CoralButton';
import { PreviewBadge } from '../components/PreviewBadge';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';
import type { PlatformKey, PlatformListing } from '../types';

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  vinted: 'Vinted',
  depop: 'Depop',
  ebay: 'eBay',
};

export function ListingScreen() {
  const listing = useStore((s) => s.listing);
  const error = useStore((s) => s.error);
  const imageUri = useStore((s) => s.imageUri);
  const selected = useStore((s) => s.selectedPlatforms);
  const regenerateListing = useStore((s) => s.regenerateListing);
  const confirmId = useStore((s) => s.confirmId);
  const idOverrides = useStore((s) => s.idOverrides);
  const goHome = useStore((s) => s.goHome);

  // Platforms to tab: those that were requested, ordered by canonical order.
  const tabs = useMemo<PlatformKey[]>(() => {
    const canonical: PlatformKey[] = ['vinted', 'depop', 'ebay'];
    return canonical.filter((p) => selected.includes(p));
  }, [selected]);

  const [activeTab, setActiveTab] = useState<PlatformKey>(tabs[0] ?? 'vinted');

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Listing didn't land</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.actions}>
            <CoralButton label="Try again" variant="primary" onPress={regenerateListing} />
            <CoralButton label="Back home" variant="outline" size="md" onPress={goHome} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Nothing to show yet.</Text>
          <CoralButton label="Back home" variant="outline" size="md" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  const platformListing = listing[activeTab];
  const failed = listing.partialErrors?.includes(activeTab) ?? false;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Listing · Step 3 of 3</Text>
          <Text style={styles.title}>Ready to paste</Text>
          <Text style={styles.sub}>
            Copy, open the platform, paste. Pick size and condition over there — we'll keep the good bits.
          </Text>
        </View>

        {/* Tab row */}
        {tabs.length > 1 && (
          <View style={styles.tabRow}>
            {tabs.map((key) => {
              const isActive = key === activeTab;
              const platFailed = listing.partialErrors?.includes(key) ?? false;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setActiveTab(key);
                  }}
                  style={[styles.tab, isActive ? styles.tabActive : styles.tabIdle]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {PLATFORM_LABELS[key]}
                    {platFailed ? ' ·' : ''}
                  </Text>
                  {platFailed && <View style={styles.tabDot} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Content for active tab */}
        {failed || !platformListing ? (
          <FailedTabPanel platform={activeTab} onRetry={() => regenerateListing()} />
        ) : (
          <TabPanel
            platform={activeTab}
            listing={platformListing}
            imageUri={imageUri ?? ''}
          />
        )}

        {/* Secondary actions */}
        <View style={styles.actions}>
          <CoralButton
            label="Rewrite these"
            subLabel="Free — won't touch your scan count."
            variant="outline"
            size="md"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              regenerateListing();
            }}
          />
          <CoralButton
            label="Back"
            variant="outline"
            size="md"
            onPress={() => {
              void Haptics.selectionAsync();
              confirmId(idOverrides);
            }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.latencyText}>
            Written in {(listing.latencyMs / 1000).toFixed(1)}s
            {__DEV__ ? ` · ${listing.modelUsed}` : ''}
          </Text>
          <PreviewBadge />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TabPanel({
  platform,
  listing,
  imageUri,
}: {
  platform: PlatformKey;
  listing: PlatformListing;
  imageUri: string;
}) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`${label} copied`);
    } catch (e) {
      showToast("Couldn't copy");
    }
  };

  const copyEverything = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let composite = `${listing.title}\n\n${listing.description}`;
    if (platform === 'depop' && listing.hashtags && listing.hashtags.length) {
      const tags = listing.hashtags.map((t) => `#${t}`).join(' ');
      // Only append if description doesn't already end with hashtags.
      if (!listing.description.includes('#')) {
        composite += `\n\n${tags}`;
      }
    }
    try {
      await Clipboard.setStringAsync(composite);
    } catch (e) {
      Alert.alert("Couldn't copy", "Clipboard was locked. Try once more?");
      return;
    }
    // Open share sheet with the image + text — user can pick Vinted/Depop/eBay from the picker.
    try {
      await Share.share({
        message: composite,
        url: imageUri || undefined,
        title: `${PLATFORM_LABELS[platform]} listing`,
      });
    } catch (e) {
      // Share sheet errors are user cancels — no-op.
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      {/* Title card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>Title</Text>
          <Text style={styles.cardCount}>{listing.title.length} chars</Text>
        </View>
        <Text style={styles.titleText} selectable>
          {listing.title}
        </Text>
        <Pressable style={styles.copyBtn} onPress={() => copyText(listing.title, 'Title')}>
          <Text style={styles.copyBtnText}>Copy title</Text>
        </Pressable>
      </View>

      {/* Description card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Description</Text>
        <Text style={styles.descriptionText} selectable>
          {listing.description}
        </Text>
        <Pressable
          style={styles.copyBtn}
          onPress={() => copyText(listing.description, 'Description')}
        >
          <Text style={styles.copyBtnText}>Copy description</Text>
        </Pressable>
      </View>

      {/* Hashtags (Depop only) */}
      {platform === 'depop' && listing.hashtags && listing.hashtags.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>Hashtags</Text>
            <Text style={styles.cardCount}>{listing.hashtags.length} of 5</Text>
          </View>
          <View style={styles.hashRow}>
            {listing.hashtags.map((t) => (
              <Text key={t} style={styles.hashtag}>
                #{t}
              </Text>
            ))}
          </View>
          <Pressable
            style={styles.copyBtn}
            onPress={() =>
              copyText(
                (listing.hashtags ?? []).map((t) => `#${t}`).join(' '),
                'Hashtags',
              )
            }
          >
            <Text style={styles.copyBtnText}>Copy all hashtags</Text>
          </Pressable>
        </View>
      )}

      <CoralButton
        label={`Copy & open ${PLATFORM_LABELS[platform]}`}
        subLabel="Paste into the app. Add size and condition over there."
        variant="primary"
        onPress={copyEverything}
      />

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function FailedTabPanel({
  platform,
  onRetry,
}: {
  platform: PlatformKey;
  onRetry: () => void;
}) {
  return (
    <View style={[styles.card, { alignItems: 'center', gap: spacing.md }]}>
      <Text style={styles.failedTitle}>{PLATFORM_LABELS[platform]} didn't land</Text>
      <Text style={styles.failedBody}>
        The other platforms are ready to copy. Tap retry to take another swing at this one.
      </Text>
      <CoralButton
        label="Retry"
        variant="outline"
        size="md"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onRetry();
        }}
      />
    </View>
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

  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.inkSoft,
    padding: 4,
    borderRadius: radii.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: { backgroundColor: colors.coral },
  tabIdle: { backgroundColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.paperDim, letterSpacing: -0.1 },
  tabTextActive: { color: colors.ink },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },

  card: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: {
    color: colors.muteLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardCount: {
    color: colors.mute,
    fontSize: 11,
    fontFamily: 'Menlo',
    letterSpacing: 0.3,
  },
  titleText: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  descriptionText: {
    color: colors.paper,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  copyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyBtnText: { color: colors.coral, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },

  hashRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hashtag: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(255,107,74,0.1)',
    borderWidth: 1,
    borderColor: colors.coral,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },

  toast: {
    position: 'absolute',
    bottom: -spacing.lg,
    alignSelf: 'center',
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  toastText: { color: colors.ink, fontSize: 13, fontWeight: '600' },

  actions: { gap: spacing.md, marginTop: spacing.md },
  footer: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  latencyText: { color: colors.mute, fontSize: 11, fontFamily: 'Menlo', letterSpacing: 0.3 },

  errorWrap: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  errorTitle: { color: colors.paper, fontSize: 22, fontWeight: '700' },
  errorBody: { color: colors.muteLight, fontSize: 14, lineHeight: 20 },

  failedTitle: { color: colors.paper, fontSize: 16, fontWeight: '700' },
  failedBody: { color: colors.muteLight, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
