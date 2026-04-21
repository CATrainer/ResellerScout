/**
 * IdReviewScreen — Flow B screen 1 of 3.
 *
 * User confirms or edits the Flow A identification before the listing call fires.
 *
 * Editability (decision: decisions.md 2026-04-20 Day-3):
 *   - Brand = inline text input (too many brands for a chip picker).
 *   - Size  = chip row of common UK sizes + "custom" text.
 *   - Condition = chip row (like_new / excellent / good / fair / poor).
 *   - Colour + category = read-only labels.
 *   - Material + fit = not collected in v1.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { CoralButton } from '../components/CoralButton';
import { PreviewBadge } from '../components/PreviewBadge';
import { useStore } from '../state/store';
import { colors, radii, spacing } from '../theme';

const SIZE_CHIPS = ['XS', 'S', 'M', 'L', 'XL', '6', '8', '10', '12', '14', '16'];
const CONDITION_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'like_new', label: 'Like new' },
  { key: 'excellent', label: 'Excellent' },
  { key: 'good', label: 'Good' },
  { key: 'fair', label: 'Fair' },
  { key: 'poor', label: 'Poor' },
];

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function IdReviewScreen() {
  const estimate = useStore((s) => s.estimate);
  const existingOverrides = useStore((s) => s.idOverrides);
  const confirmId = useStore((s) => s.confirmId);
  const goBackToPrice = useStore((s) => s.setEstimate);

  const base = estimate?.identification;

  // Prefill from prior overrides (back-nav from Platform Pick) if present, else Flow A base.
  const initialBrand = existingOverrides.brand ?? base?.brand ?? '';
  const initialSize = existingOverrides.size ?? base?.size ?? '';
  const initialCondition = existingOverrides.condition ?? base?.condition ?? 'good';

  const [brand, setBrand] = useState(initialBrand);
  const [size, setSize] = useState(
    initialSize && SIZE_CHIPS.includes(initialSize) ? initialSize : '',
  );
  const [customSize, setCustomSize] = useState(
    initialSize && !SIZE_CHIPS.includes(initialSize) ? initialSize : '',
  );
  const [useCustomSize, setUseCustomSize] = useState(
    !!initialSize && !SIZE_CHIPS.includes(initialSize),
  );
  const [condition, setCondition] = useState(initialCondition);

  if (!estimate || !base) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Nothing to review yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const effectiveSize = useCustomSize ? customSize.trim() : size;
  const canContinue = brand.trim().length > 0 && effectiveSize.length > 0 && condition.length > 0;

  const handleContinue = () => {
    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    confirmId({
      brand: brand.trim(),
      size: effectiveSize,
      condition,
    });
  };

  const handleBack = () => {
    void Haptics.selectionAsync();
    // Restore priceReveal by re-setting the same estimate — doesn't double-count.
    goBackToPrice(estimate);
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.eyebrow}>Listing · Step 1 of 3</Text>
              <Text style={styles.title}>Check the details</Text>
              <Text style={styles.sub}>
                Tap anything that's off. Colour and category stay as they were.
              </Text>
            </View>

            {/* Brand — inline text input */}
            <View style={styles.field}>
              <Text style={styles.label}>Brand</Text>
              <TextInput
                value={brand}
                onChangeText={setBrand}
                placeholder="e.g. Next"
                placeholderTextColor={colors.mute}
                style={styles.input}
                autoCapitalize="words"
                returnKeyType="done"
                accessibilityLabel="Brand"
              />
            </View>

            {/* Size — chip row + custom */}
            <View style={styles.field}>
              <Text style={styles.label}>Size</Text>
              <View style={styles.chipRow}>
                {SIZE_CHIPS.map((s) => {
                  const active = !useCustomSize && size === s;
                  return (
                    <ChipLike
                      key={s}
                      label={s}
                      active={active}
                      onPress={() => {
                        setUseCustomSize(false);
                        setSize(s);
                      }}
                    />
                  );
                })}
                <ChipLike
                  label="Custom…"
                  active={useCustomSize}
                  onPress={() => setUseCustomSize(true)}
                />
              </View>
              {useCustomSize && (
                <TextInput
                  value={customSize}
                  onChangeText={setCustomSize}
                  placeholder="Enter size"
                  placeholderTextColor={colors.mute}
                  style={[styles.input, { marginTop: spacing.sm }]}
                  returnKeyType="done"
                  accessibilityLabel="Custom size"
                />
              )}
            </View>

            {/* Condition — chip row */}
            <View style={styles.field}>
              <Text style={styles.label}>Condition</Text>
              <View style={styles.chipRow}>
                {CONDITION_CHIPS.map((c) => (
                  <ChipLike
                    key={c.key}
                    label={c.label}
                    active={condition === c.key}
                    onPress={() => setCondition(c.key)}
                  />
                ))}
              </View>
            </View>

            {/* Read-only pass-through */}
            <View style={styles.readOnlyBlock}>
              <ReadOnlyRow label="Category" value={titleCase(base.category)} />
              <ReadOnlyRow label="Colour" value={titleCase(base.colour)} />
            </View>

            <View style={styles.actions}>
              <CoralButton
                label="Looks right"
                variant={canContinue ? 'primary' : 'disabled'}
                onPress={canContinue ? handleContinue : undefined}
              />
              <CoralButton label="Back" variant="outline" size="md" onPress={handleBack} />
            </View>

            <View style={styles.footer}>
              <PreviewBadge />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChipLike({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const handlePress = () => {
    void Haptics.selectionAsync();
    onPress();
  };
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : styles.chipLabelIdle]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value || '—'}</Text>
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

  field: { gap: spacing.sm },
  label: {
    color: colors.muteLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.paper,
    fontSize: 16,
    fontWeight: '500',
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipIdle: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: colors.coral,
    backgroundColor: colors.coral,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelIdle: { color: colors.paperDim },
  chipLabelActive: { color: colors.ink },

  readOnlyBlock: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  readOnlyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readOnlyLabel: {
    color: colors.muteLight,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  readOnlyValue: { color: colors.paper, fontSize: 14, fontWeight: '500' },

  actions: { gap: spacing.md, marginTop: spacing.md },
  footer: { alignItems: 'center', marginTop: spacing.md },
  errorWrap: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  errorTitle: { color: colors.paper, fontSize: 22, fontWeight: '700' },
});
