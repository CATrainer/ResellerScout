/**
 * PlatformChip — multi-select platform chip for the Platform Pick screen.
 *
 * Distinct from TagChip: TagChip is a static read-only label; PlatformChip is
 * interactive with a selected/unselected visual state and a press handler.
 *
 * Selected state: coral fill + ink text.
 * Unselected state: ink outline + paperDim text.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing } from '../theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function PlatformChip({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={`${label}, ${selected ? 'selected' : 'not selected'}`}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        disabled && styles.disabled,
        pressed && !disabled && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={[styles.text, selected ? styles.textSelected : styles.textUnselected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  unselected: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  textSelected: { color: colors.ink },
  textUnselected: { color: colors.paperDim },
});
