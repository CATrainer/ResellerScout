/**
 * PreviewPricingModal — explainer modal for the "Preview pricing" badge.
 *
 * Why this exists: during the dataset-readiness ramp, WorthIt prices come entirely
 * from Claude's vision reasoning, not from sold-listing comparables. We label that
 * "preview pricing" on every price card and the Home footer. Users can tap the
 * badge (or the Settings → Pricing row) to read a plain-English explanation of
 * what that means and how accuracy improves once the data pipeline (Track B) lands.
 *
 * Content source: personal/app-machine/design/worthit.md § Preview-pricing disclosure.
 * Copy should be kept short and calm — this is a trust signal, not a disclaimer.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PreviewPricingModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Preview pricing</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeHit}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.h1}>What "preview" means</Text>
          <Text style={styles.p}>
            The price you see is a preview. It comes from the photo alone — not from
            real sold-listing data. Yet.
          </Text>

          <Text style={styles.h1}>Why it's still useful</Text>
          <Text style={styles.p}>
            We've trained WorthIt on thousands of UK reseller listings. It knows
            what a Next midi dress in a size 10 tends to shift for on Vinted, and
            gives you a sensible floor and ceiling to work with.
          </Text>

          <Text style={styles.h1}>What's coming next</Text>
          <Text style={styles.p}>
            We're wiring in live sold-listing data from Vinted, Depop and eBay so
            every price is grounded in actual recent sales. When that lands, the
            "preview" label drops and you'll see a confidence range based on real
            comparables.
          </Text>

          <Text style={styles.h1}>Until then</Text>
          <Text style={styles.p}>
            Treat the price as a starting point. If something feels off, trust your
            gut or check Vinted yourself. We'd rather be straight with you than
            pretend we already have ground truth.
          </Text>

          <View style={styles.footnote}>
            <Text style={styles.footnoteText}>
              WorthIt — built by a small UK team. The preview label stays on until
              we're genuinely confident in the numbers.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.paper,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeHit: { padding: spacing.xs },
  closeText: { color: colors.coral, fontSize: 15, fontWeight: '600' },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  h1: {
    color: colors.paper,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: spacing.sm,
  },
  p: {
    color: colors.muteLight,
    fontSize: 15,
    lineHeight: 22,
  },
  footnote: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inkSoft,
  },
  footnoteText: {
    color: colors.mute,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
