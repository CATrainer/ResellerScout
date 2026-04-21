import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme';

interface Props {
  label: string;
  tone?: 'default' | 'accent';
}

export function TagChip({ label, tone = 'default' }: Props) {
  return (
    <View style={[styles.chip, tone === 'accent' ? styles.accent : styles.default]}>
      <Text style={[styles.text, tone === 'accent' ? styles.textAccent : styles.textDefault]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  default: {
    borderColor: 'rgba(11,11,15,0.12)',
    backgroundColor: 'rgba(11,11,15,0.04)',
  },
  accent: {
    borderColor: colors.coral,
    backgroundColor: 'rgba(255,107,74,0.1)',
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  textDefault: { color: colors.ink },
  textAccent: { color: colors.coralDeep },
});
