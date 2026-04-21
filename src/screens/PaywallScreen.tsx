/**
 * PaywallScreen — hard paywall entered after the first free scan (or when a
 * free/pro user hits their daily cap).
 *
 * Decision record: decisions.md 2026-04-09 — "Hard paywall after first scan."
 * Fairness check: scan + reveal are fully free on the first run; the paywall
 * only blocks the second scan attempt, not the one-shot demo. Users who really
 * only want to check one item still get that.
 *
 * Two plans side-by-side (Pro default-selected):
 *   - WorthIt Pro      — £6.99/mo, £49.99/yr, 3-day free trial — 100 scans/mo
 *   - WorthIt Pro Plus — £11.99/mo, £89.99/yr, 3-day free trial — unlimited
 *
 * The RC offering drives real prices (localised) in production. We render
 * fallback static copy when the offering isn't yet loaded so the screen isn't
 * empty on first mount.
 *
 * Required by Apple Guideline 3.1.1: "Restore purchases" must be present and
 * reachable from the paywall. Our bottom "Restore purchases" text link covers it.
 *
 * On Day 5, this screen will also render a "Sign in with Apple" button if the
 * user isn't signed in yet — RC works with anonymous ids, but we prefer to tie
 * purchases to the Supabase user immediately so they survive re-installs.
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CoralButton } from '../components/CoralButton';
import {
  configurePurchases,
  getDefaultOffering,
  purchasePackage,
  restorePurchases,
} from '../services/purchasesService';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';

type TierKey = 'pro' | 'pro_plus';

interface StaticTier {
  key: TierKey;
  title: string;
  tagline: string;
  priceMonthly: string;
  priceAnnual: string;
  perks: string[];
}

// Fallback copy used until the RC offering loads (or when it fails to load).
// Real prices come from RC in production — these are store-submission placeholders.
// Decisions (2026-04-20 Day-4 polish):
//   - Dropped "3-day free trial" as a perk — already in hero + CTA, 5-mentions on screen was too much.
//   - Dropped "Priority model latency" — we don't actually deliver that. Replaced with "Everything in Pro".
const STATIC_TIERS: StaticTier[] = [
  {
    key: 'pro',
    title: 'Pro',
    tagline: 'For steady resellers.',
    priceMonthly: '£6.99 / month',
    priceAnnual: '£49.99 / year',
    perks: [
      '100 scans a month',
      'Full listings for Vinted, Depop & eBay',
      'Rewrite listings for free',
    ],
  },
  {
    key: 'pro_plus',
    title: 'Pro Plus',
    tagline: 'For shops shifting stock all day.',
    priceMonthly: '£11.99 / month',
    priceAnnual: '£89.99 / year',
    perks: [
      'Unlimited scans',
      'Everything in Pro',
      'Best value if you list most days',
    ],
  },
];

export function PaywallScreen() {
  const closeModal = useStore((s) => s.closeModal);
  const setPlan = useStore((s) => s.setPlan);

  const [selected, setSelected] = useState<TierKey>('pro'); // Pro default per spec
  const [offering, setOffering] = useState<unknown>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await configurePurchases();
        const current = await getDefaultOffering();
        if (!cancelled) setOffering(current);
      } catch (e) {
        if (!cancelled) {
          setErrorText(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingOffering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tiers = useMemo(() => {
    // Day-4: render static tiers. Day-5 joint pass replaces this with RC offering packages.
    // The RC offering shape is opaque to this layer; we defer actual package selection
    // to the purchase handler (which pulls the right package off `offering` at call time).
    return STATIC_TIERS;
  }, []);

  const handleUpgrade = async () => {
    setErrorText(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Day-4: without a live RC offering we can't actually purchase. In prod we
    // want a neutral "try again" message; in dev we show the real reason.
    if (!offering) {
      setErrorText(
        __DEV__
          ? "Subscriptions aren't configured yet. Wire up the RevenueCat offering."
          : "Something's off on our end. Try again in a moment.",
      );
      return;
    }
    setBusy('purchase');
    try {
      const pkg = pickPackage(offering, selected);
      if (!pkg) {
        setErrorText("We couldn't find that plan. Try the other one?");
        return;
      }
      const entitlement = await purchasePackage(pkg);
      if (entitlement) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPlan(entitlement);
        closeModal();
      }
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setErrorText(null);
    void Haptics.selectionAsync();
    setBusy('restore');
    try {
      const entitlement = await restorePurchases();
      if (entitlement) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPlan(entitlement);
        closeModal();
      } else {
        setErrorText("No active subscription on this Apple ID.");
      }
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.headline}>Keep scanning</Text>
          <Text style={styles.subhead}>
            Pick a plan to carry on. First three days are on us.
          </Text>
        </View>

        <View style={styles.cards}>
          {tiers.map((t) => (
            <TierCard
              key={t.key}
              tier={t}
              selected={selected === t.key}
              onSelect={() => {
                void Haptics.selectionAsync();
                setSelected(t.key);
              }}
            />
          ))}
        </View>

        {loadingOffering && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.coral} />
            <Text style={styles.loadingCopy}>Loading prices…</Text>
          </View>
        )}

        {errorText && <Text style={styles.error}>{errorText}</Text>}

        <View style={styles.ctaBlock}>
          <CoralButton
            label={busy === 'purchase' ? 'Starting your trial…' : 'Start my free trial'}
            subLabel="3 days free. Cancel anytime. Auto-renews after."
            variant="primary"
            onPress={busy ? undefined : handleUpgrade}
          />

          <Pressable
            onPress={busy ? undefined : handleRestore}
            style={styles.restoreHit}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
          >
            <Text style={styles.restoreText}>
              {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
            </Text>
          </Pressable>

          <Pressable
            onPress={busy ? undefined : () => {
              void Haptics.selectionAsync();
              closeModal();
            }}
            style={styles.dismissHit}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          Auto-renews until cancelled. Manage in Apple ID → Subscriptions.
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface TierCardProps {
  tier: StaticTier;
  selected: boolean;
  onSelect: () => void;
}

function TierCard({ tier, selected, onSelect }: TierCardProps) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>
            {tier.title}
          </Text>
          <Text style={styles.cardTagline}>{tier.tagline}</Text>
        </View>
        {selected && <View style={styles.selectedPip} />}
      </View>
      <Text style={[styles.cardPrice, selected && styles.cardPriceSelected]}>
        {tier.priceAnnual}
      </Text>
      <Text style={styles.cardPriceAlt}>or {tier.priceMonthly}</Text>
      <View style={styles.perks}>
        {tier.perks.map((p) => (
          <Perk key={p} text={p} />
        ))}
      </View>
    </Pressable>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <View style={styles.perkRow}>
      <Text style={styles.perkTick}>✓</Text>
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

/**
 * Pick the annual package for the selected tier off an RC offering.
 * RC offering shape (8.x): { annual?: Package, monthly?: Package, availablePackages: Package[] }
 * Each Package has an `identifier` + `product.identifier`. We match by a naming
 * convention ("pro" / "pro_plus" somewhere in the identifier) so Caleb can name
 * packages freely in the dashboard as long as those tokens appear.
 */
function pickPackage(offering: unknown, tier: TierKey): unknown {
  const off = offering as
    | {
        availablePackages?: Array<{ identifier?: string; product?: { identifier?: string } }>;
        annual?: { identifier?: string; product?: { identifier?: string } };
        monthly?: { identifier?: string; product?: { identifier?: string } };
      }
    | null
    | undefined;
  const packages = off?.availablePackages ?? [];
  const token = tier; // 'pro' or 'pro_plus'
  // Prefer annual if present, else monthly — "Start trial" is annual-by-default per spec.
  const annual = packages.find((p) => matches(p, token, 'annual'));
  if (annual) return annual;
  const monthly = packages.find((p) => matches(p, token, 'monthly'));
  if (monthly) return monthly;
  // Fallback: any package mentioning the tier token.
  return packages.find((p) => matchesToken(p, token)) ?? null;
}

function matches(
  pkg: { identifier?: string; product?: { identifier?: string } },
  tierToken: string,
  periodToken: string,
): boolean {
  return matchesToken(pkg, tierToken) && matchesToken(pkg, periodToken);
}

function matchesToken(
  pkg: { identifier?: string; product?: { identifier?: string } },
  token: string,
): boolean {
  const id = (pkg.identifier ?? '').toLowerCase();
  const prod = (pkg.product?.identifier ?? '').toLowerCase();
  return id.includes(token) || prod.includes(token);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { gap: spacing.sm, marginTop: spacing.lg },
  headline: {
    color: colors.paper,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subhead: {
    color: colors.muteLight,
    fontSize: 15,
    lineHeight: 21,
  },
  cards: { gap: spacing.md },
  card: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardSelected: {
    borderColor: colors.coral,
    backgroundColor: '#1E1419',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeadText: { flex: 1, gap: 2 },
  cardTitle: {
    color: colors.paperDim,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardTitleSelected: {
    color: colors.paper,
  },
  cardTagline: {
    color: colors.mute,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  selectedPip: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.coral,
  },
  cardPrice: {
    color: colors.paper,
    fontSize: 26,
    fontWeight: '700',
    marginTop: spacing.sm,
    letterSpacing: -0.5,
  },
  cardPriceSelected: { color: colors.paper },
  cardPriceAlt: {
    color: colors.mute,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  perks: { gap: spacing.xs, marginTop: spacing.xs },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  perkTick: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  perkText: {
    color: colors.muteLight,
    fontSize: 14,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  loadingCopy: { color: colors.mute, fontSize: 12 },
  error: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  ctaBlock: { gap: spacing.sm, marginTop: spacing.sm },
  restoreHit: { alignItems: 'center', padding: spacing.sm },
  restoreText: {
    color: colors.paperDim,
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  dismissHit: { alignItems: 'center', padding: spacing.sm },
  dismissText: {
    color: colors.mute,
    fontSize: 13,
  },
  legal: {
    color: colors.mute,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.md,
  },
});
