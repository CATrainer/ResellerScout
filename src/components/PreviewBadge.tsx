/**
 * PreviewBadge — "Preview pricing" coral outline pill.
 *
 * Persistent until dataset-readiness rule fires (see plan-v5 + design/worthit.md).
 * Tappable (when `onPress` is passed) — opens the PreviewPricingModal. If no
 * `onPress` is given, the badge is non-interactive (e.g. in contexts where tap
 * would collide with a parent press target).
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme';

interface Props {
  variant?: 'strong' | 'subtle';
  onPress?: () => void;
}

export function PreviewBadge({ variant = 'strong', onPress }: Props) {
  const label = variant === 'strong' ? 'Preview pricing — learn more' : 'Preview pricing';
  const handlePress = onPress
    ? () => {
        void Haptics.selectionAsync();
        onPress();
      }
    : undefined;
  return (
    <Pressable
      onPress={handlePress}
      disabled={!handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pill,
        variant === 'strong' ? styles.strong : styles.subtle,
        pressed && handlePress && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.dot, variant === 'strong' ? styles.dotStrong : styles.dotSubtle]} />
      <Text style={[styles.text, variant === 'strong' ? styles.textStrong : styles.textSubtle]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    gap: 8,
  },
  strong: {
    borderWidth: 1,
    borderColor: colors.coral,
    backgroundColor: 'rgba(255, 107, 74, 0.08)',
  },
  subtle: {
    borderWidth: 1,
    borderColor: colors.mute,
    backgroundColor: 'transparent',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotStrong: { backgroundColor: colors.coral },
  dotSubtle: { backgroundColor: colors.mute },
  text: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  textStrong: { color: colors.coral },
  textSubtle: { color: colors.muteLight },
});
