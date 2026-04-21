/**
 * BrandLoader — the two-chevron-pulsing-upward loader.
 *
 * From Brand system.html: two stacked chevron bars that cycle 1.2 s,
 * the second bar delayed so they read as "loading upward".
 *
 * Pure RN Animated — no Reanimated dep needed.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  size?: number; // width of each chevron in px
  colour?: string;
}

export function BrandLoader({ size = 48, colour = colors.coral }: Props) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const cycle = (val: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 600,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
    const lead = cycle(a);
    const trail = cycle(b);
    lead.start();
    const delay = setTimeout(() => trail.start(), 300);
    return () => {
      lead.stop();
      trail.stop();
      clearTimeout(delay);
    };
  }, [a, b]);

  const chev = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [
      { translateY: val.interpolate({ inputRange: [0, 1], outputRange: [6, -2] }) },
    ],
  });

  const barHeight = Math.max(6, Math.round(size * 0.18));
  const barWidth = size;

  return (
    <View style={[styles.wrap, { height: size * 1.4, width: size * 1.2 }]}>
      <Animated.View
        style={[
          styles.chevron,
          { width: barWidth, height: barHeight, backgroundColor: colour, top: size * 0.2 },
          chev(b),
        ]}
      />
      <Animated.View
        style={[
          styles.chevron,
          { width: barWidth, height: barHeight, backgroundColor: colour, top: size * 0.55 },
          chev(a),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  chevron: {
    position: 'absolute',
    borderRadius: 3,
    transform: [{ skewX: '-6deg' }],
  },
});
