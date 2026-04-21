import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraScreen } from './src/screens/CameraScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { IdReviewScreen } from './src/screens/IdReviewScreen';
import { ListingScreen } from './src/screens/ListingScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { PlatformPickScreen } from './src/screens/PlatformPickScreen';
import { PriceRevealScreen } from './src/screens/PriceRevealScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  getCurrentUser,
  onAuthStateChange,
} from './src/services/authService';
import {
  configurePurchases,
  getEntitlement,
  logInPurchases,
} from './src/services/purchasesService';
import { useStore } from './src/state/store';
import { colors } from './src/theme';

/**
 * WorthIt — Day 4.
 *
 * Nine-screen store-driven router covering Flow A + Flow B + paywall + settings:
 *   home → camera → loading (estimate) → priceReveal
 *                                           ↓ "Make a listing"
 *                                         idReview → platformPick → loading (listing) → listing
 *                                           ↓ (cap exhausted or tapped Upgrade)
 *                                         paywall  (hard paywall, Apple-compliant)
 *   home ← settings (launched from the Home gear icon)
 *
 * Routing is driven by the Zustand store (src/state/store.ts). Migration to expo-router
 * is deferred to post-TestFlight (decisions.md 2026-04-20 Day-3). Paywall + settings
 * use `previousScreen` so `closeModal()` pops back to wherever they were invoked from.
 *
 * On-mount side-effects (wired Day 4):
 *   - Rehydrate Supabase session → hydrate store.userId / userEmail
 *   - Subscribe to auth state changes (sign-in / sign-out)
 *   - Configure RevenueCat with the platform SDK key
 *   - Log the current entitlement into store.plan
 *
 * Metric bars in play (per design/worthit.md v5):
 *   - Flow A: photo → price reveal < 3 s (normal network)
 *   - Flow B: photo → ready-to-paste listing < 20 s end-to-end
 *   - Item ID accuracy ≥ 90% (measured in Day-3 accuracy pass on 20 items)
 *
 * See personal/app-machine/design/worthit.md for the canonical product surface.
 */

export default function App() {
  const screen = useStore((s) => s.screen);
  const setUser = useStore((s) => s.setUser);
  const setPlan = useStore((s) => s.setPlan);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    (async () => {
      // 1. Hydrate Supabase session (if present from a prior launch).
      try {
        const user = await getCurrentUser();
        if (user) {
          setUser({ id: user.id, email: user.email ?? null });
        }
      } catch {
        /* non-fatal — first launch, no session */
      }

      // 2. Subscribe to auth state changes.
      unsubscribe = onAuthStateChange((session) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email ?? null });
          // Bind RC id to the Supabase user so purchases follow across devices.
          void logInPurchases(session.user.id).catch(() => {
            /* non-blocking */
          });
        } else {
          setUser(null);
        }
      });

      // 3. Configure RevenueCat + read entitlement.
      try {
        await configurePurchases();
        const ent = await getEntitlement();
        if (ent) setPlan(ent);
      } catch {
        /* RC unavailable in Expo Go — paywall shows static copy */
      }
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [setUser, setPlan]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {screen === 'home' && <HomeScreen />}
      {screen === 'camera' && <CameraScreen />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'priceReveal' && <PriceRevealScreen />}
      {screen === 'idReview' && <IdReviewScreen />}
      {screen === 'platformPick' && <PlatformPickScreen />}
      {screen === 'listing' && <ListingScreen />}
      {screen === 'paywall' && <PaywallScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
});
