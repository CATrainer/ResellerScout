/**
 * CoralButton — primary CTA. Coral background, ink text, full-bleed within parent row.
 *
 * Variants:
 *  - "primary" (filled coral)
 *  - "outline" (coral border, coral text, transparent bg)
 *  - "disabled" (muted border + text + "Coming soon" style)
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';

interface Props {
  label: string;
  subLabel?: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'disabled';
  size?: 'lg' | 'md';
  icon?: React.ReactNode;
}

export function CoralButton({
  label,
  subLabel,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
}: Props) {
  const isDisabled = variant === 'disabled';
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        size === 'lg' ? styles.lg : styles.md,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'disabled' && styles.disabled,
        pressed && !isDisabled && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.inner}>
        {icon && <View style={{ marginRight: spacing.sm }}>{icon}</View>}
        <View>
          <Text
            style={[
              styles.label,
              variant === 'primary' && styles.labelPrimary,
              variant === 'outline' && styles.labelOutline,
              variant === 'disabled' && styles.labelDisabled,
            ]}
          >
            {label}
          </Text>
          {subLabel && (
            <Text
              style={[
                styles.sub,
                variant === 'primary' && styles.subPrimary,
                variant === 'outline' && styles.subOutline,
                variant === 'disabled' && styles.subDisabled,
              ]}
            >
              {subLabel}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  lg: { paddingVertical: 20, paddingHorizontal: 24 },
  md: { paddingVertical: 14, paddingHorizontal: 18 },
  inner: { flexDirection: 'row', alignItems: 'center' },
  primary: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.coral,
  },
  disabled: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  labelPrimary: { color: colors.ink },
  labelOutline: { color: colors.coral },
  labelDisabled: { color: colors.muteLight },
  subPrimary: { color: 'rgba(11,11,15,0.7)' },
  subOutline: { color: colors.coralDeep },
  subDisabled: { color: colors.mute },
});
