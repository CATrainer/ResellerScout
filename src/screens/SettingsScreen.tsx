/**
 * SettingsScreen — launched from the Home gear icon.
 *
 * Sections (top → bottom):
 *   - Plan          (current plan pill + "Manage subscription" deep link)
 *   - Account       (email + "Sign in with Apple" / "Sign out")
 *   - Pricing       ("Why are prices a preview?" explainer — opens modal)
 *   - Legal         (Terms, Privacy Policy, Support email)
 *   - App           (version number, build number)
 *
 * Subscription management on iOS cannot happen in-app — Apple requires the
 * system "Manage Subscriptions" sheet. We use the well-known iOS deep link:
 *   itms-apps://apps.apple.com/account/subscriptions
 */

import Constants from 'expo-constants';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PreviewPricingModal } from '../components/PreviewPricingModal';
import {
  AuthError,
  isAppleAuthAvailable,
  signInWithApple,
  signOut,
} from '../services/authService';
import { logInPurchases, logOutPurchases } from '../services/purchasesService';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';

const MANAGE_SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

const TERMS_URL = 'https://worthit.app/terms'; // placeholder — to be published pre-TestFlight
const PRIVACY_URL = 'https://worthit.app/privacy'; // placeholder — to be published pre-TestFlight
const SUPPORT_EMAIL = 'support@worthit.app';

export function SettingsScreen() {
  const closeModal = useStore((s) => s.closeModal);
  const openPaywall = useStore((s) => s.openPaywall);
  const setUser = useStore((s) => s.setUser);
  const setPlan = useStore((s) => s.setPlan);
  const userEmail = useStore((s) => s.userEmail);
  const userId = useStore((s) => s.userId);
  const plan = useStore((s) => s.plan);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await isAppleAuthAvailable())) {
        Alert.alert('Sign in with Apple is not available on this device.');
        return;
      }
      const session = await signInWithApple();
      const u = session.user;
      setUser({ id: u.id, email: u.email ?? null });
      // Bind RC id to the Supabase user so purchases follow across devices.
      try {
        await logInPurchases(u.id);
      } catch {
        /* non-blocking — restore still works via Apple ID */
      }
    } catch (e) {
      if (e instanceof AuthError && e.kind === 'cancelled') return;
      Alert.alert(
        "Couldn't sign you in",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, [setUser]);

  const handleSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOut();
      await logOutPurchases();
      setUser(null);
      setPlan('free');
    } catch (e) {
      Alert.alert(
        "Couldn't sign you out",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, [setPlan, setUser]);

  const openExternal = useCallback(async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert("Couldn't open that", url);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Couldn't open that", url);
    }
  }, []);

  const signedIn = Boolean(userId);
  const planLabel =
    plan === 'pro' ? 'Pro' : plan === 'pro_plus' ? 'Pro Plus' : 'Free';
  const appVersion =
    (Constants.expoConfig as { version?: string } | null | undefined)?.version ??
    '0.1.0';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={closeModal} hitSlop={12} style={styles.closeHit}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.closeHit} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Section title="Plan">
          <Row label="Current plan" value={<PlanPill label={planLabel} plan={plan} />} />
          {plan === 'free' ? (
            <Pressable onPress={openPaywall} style={styles.actionRow}>
              <Text style={styles.actionLabel}>Upgrade to Pro</Text>
              <Text style={styles.actionChevron}>›</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => openExternal(MANAGE_SUBSCRIPTIONS_URL)}
              style={styles.actionRow}
            >
              <Text style={styles.actionLabel}>Manage subscription</Text>
              <Text style={styles.actionChevron}>›</Text>
            </Pressable>
          )}
        </Section>

        <Section title="Account">
          {signedIn ? (
            <>
              <Row label="Signed in as" value={<Text style={styles.value}>{userEmail ?? 'Your Apple ID'}</Text>} />
              <Pressable
                onPress={busy ? undefined : handleSignOut}
                style={styles.actionRow}
              >
                <Text style={[styles.actionLabel, styles.destructive]}>
                  {busy ? 'Signing out…' : 'Sign out'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={busy ? undefined : handleSignIn}
              style={styles.actionRow}
            >
              <Text style={styles.actionLabel}>
                {busy ? 'Signing in…' : 'Sign in with Apple'}
              </Text>
              <Text style={styles.actionChevron}>›</Text>
            </Pressable>
          )}
        </Section>

        <Section title="Pricing">
          <Pressable onPress={() => setPreviewOpen(true)} style={styles.actionRow}>
            <Text style={styles.actionLabel}>Why are prices a preview?</Text>
            <Text style={styles.actionChevron}>›</Text>
          </Pressable>
        </Section>

        <Section title="Legal">
          <Pressable onPress={() => openExternal(TERMS_URL)} style={styles.actionRow}>
            <Text style={styles.actionLabel}>Terms of Use</Text>
            <Text style={styles.actionChevron}>›</Text>
          </Pressable>
          <Pressable onPress={() => openExternal(PRIVACY_URL)} style={styles.actionRow}>
            <Text style={styles.actionLabel}>Privacy Policy</Text>
            <Text style={styles.actionChevron}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => openExternal(`mailto:${SUPPORT_EMAIL}`)}
            style={styles.actionRow}
          >
            <Text style={styles.actionLabel}>Contact support</Text>
            <Text style={styles.actionChevron}>›</Text>
          </Pressable>
        </Section>

        <Section title="App">
          <Row label="Version" value={<Text style={styles.value}>{appVersion}</Text>} />
        </Section>
      </ScrollView>

      <PreviewPricingModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value}
    </View>
  );
}

function PlanPill({ label, plan }: { label: string; plan: 'free' | 'pro' | 'pro_plus' }) {
  const bg =
    plan === 'free' ? colors.inkSoft : plan === 'pro' ? colors.coral : colors.lilac;
  const fg = plan === 'free' ? colors.paperDim : colors.ink;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  closeHit: { padding: spacing.sm, minWidth: 60 },
  closeText: { color: colors.coral, fontSize: 15, fontWeight: '600' },
  title: {
    color: colors.paper,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  sectionTitle: {
    color: colors.mute,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionBody: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rowLabel: { color: colors.muteLight, fontSize: 14 },
  value: { color: colors.paper, fontSize: 14, fontWeight: '500' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: { color: colors.paper, fontSize: 15, fontWeight: '500' },
  actionChevron: { color: colors.mute, fontSize: 22, fontWeight: '300' },
  destructive: { color: colors.error },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});
