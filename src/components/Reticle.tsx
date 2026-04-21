/**
 * Reticle — coral corner brackets + animated horizontal scan-line.
 *
 * Pure UI. No functional scan. Signals the AI moment on TikTok.
 * Brand system § scan-view: four .reticle i brackets + a coral .scanline running top→bottom.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  width: number;
  height: number;
}

export function Reticle({ width, height }: Props) {
  const scanY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scanY, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scanY]);

  const bracketSize = Math.min(48, Math.round(Math.min(width, height) * 0.08));
  const thickness = 3;

  const scanLineTranslate = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height - 4],
  });

  return (
    <View style={[styles.wrap, { width, height }]} pointerEvents="none">
      {/* TL */}
      <View style={[styles.bracket, styles.tl, bracketStyle(bracketSize, thickness, 'tl')]} />
      {/* TR */}
      <View style={[styles.bracket, styles.tr, bracketStyle(bracketSize, thickness, 'tr')]} />
      {/* BL */}
      <View style={[styles.bracket, styles.bl, bracketStyle(bracketSize, thickness, 'bl')]} />
      {/* BR */}
      <View style={[styles.bracket, styles.br, bracketStyle(bracketSize, thickness, 'br')]} />

      {/* scan line */}
      <Animated.View
        style={[
          styles.scanLine,
          {
            width: width - 32,
            transform: [{ translateY: scanLineTranslate }],
          },
        ]}
      />
    </View>
  );
}

function bracketStyle(size: number, thick: number, corner: 'tl' | 'tr' | 'bl' | 'br') {
  const base = { width: size, height: size, borderColor: colors.coral };
  switch (corner) {
    case 'tl':
      return { ...base, borderTopWidth: thick, borderLeftWidth: thick };
    case 'tr':
      return { ...base, borderTopWidth: thick, borderRightWidth: thick };
    case 'bl':
      return { ...base, borderBottomWidth: thick, borderLeftWidth: thick };
    case 'br':
      return { ...base, borderBottomWidth: thick, borderRightWidth: thick };
  }
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  bracket: { position: 'absolute' },
  tl: { top: 24, left: 24 },
  tr: { top: 24, right: 24 },
  bl: { bottom: 24, left: 24 },
  br: { bottom: 24, right: 24 },
  scanLine: {
    position: 'absolute',
    left: 16,
    height: 2,
    backgroundColor: colors.coral,
    opacity: 0.85,
    shadowColor: colors.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
});
