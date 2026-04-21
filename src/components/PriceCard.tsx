/**
 * PriceCard — hero reveal on the Price Reveal screen.
 *
 * Layout from Brand system § .price-card:
 *  - Thumbnail top-left
 *  - Tag chips row: brand / category / size / colour
 *  - Big suggested price (JetBrains Mono stand-in for Day 2)
 *  - Range below in Inter 400
 *  - IQR bar with coral dot marker
 *  - Three stat cards: "n comps" / "confidence" / "freshness"
 *
 * Day 2: n comps = "—", freshness = "preview" until Track B grounds results.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '../theme';
import type { EstimateResult } from '../types';
import { TagChip } from './TagChip';

interface Props {
  estimate: EstimateResult;
  imageUri: string;
}

export function PriceCard({ estimate, imageUri }: Props) {
  const { identification, price, confidence } = estimate;
  const { suggestedGbp, rangeLowGbp, rangeHighGbp } = price;
  const pos =
    rangeHighGbp > rangeLowGbp
      ? Math.min(
          1,
          Math.max(0, (suggestedGbp - rangeLowGbp) / (rangeHighGbp - rangeLowGbp)),
        )
      : 0.5;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.headText}>
          <Text style={styles.itemLabel}>Identified</Text>
          <Text style={styles.itemName} numberOfLines={2}>
            {titleCase(identification.brand)}{' '}
            {identification.category !== 'unknown' ? identification.category : 'item'}
            {identification.size && identification.size !== 'unknown' ? `, size ${identification.size}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        {identification.brand !== 'unknown' && <TagChip label={titleCase(identification.brand)} tone="accent" />}
        {identification.category !== 'unknown' && <TagChip label={identification.category} />}
        {identification.size !== 'unknown' && <TagChip label={`size ${identification.size}`} />}
        {identification.colour !== 'unknown' && <TagChip label={identification.colour} />}
      </View>

      <View style={styles.priceBlock}>
        <Text style={styles.priceCurrency}>£</Text>
        <Text style={styles.priceBig}>{suggestedGbp || '—'}</Text>
      </View>
      <Text style={styles.range}>
        Typical sold range: £{rangeLowGbp}–£{rangeHighGbp}
      </Text>

      <View style={styles.iqrWrap}>
        <View style={styles.iqrTrack} />
        <View style={[styles.iqrMarker, { left: `${pos * 100}%` }]} />
        <View style={styles.iqrEnds}>
          <Text style={styles.iqrEndText}>£{rangeLowGbp}</Text>
          <Text style={styles.iqrEndText}>£{rangeHighGbp}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat label="n comps" value="—" />
        <Stat label="confidence" value={confidence} />
        <Stat label="freshness" value="preview" />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function titleCase(s: string): string {
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radii.sm, backgroundColor: colors.paperDim },
  thumbPlaceholder: { backgroundColor: colors.paperDim },
  headText: { flex: 1 },
  itemLabel: { color: colors.mute, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  itemName: { color: colors.ink, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  priceBlock: { flexDirection: 'row', alignItems: 'flex-end' },
  priceCurrency: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '500',
    fontFamily: fontFamily.mono,
    marginRight: 2,
    marginBottom: 10,
  },
  priceBig: {
    color: colors.ink,
    fontSize: 72,
    fontWeight: '500',
    fontFamily: fontFamily.mono,
    letterSpacing: -2,
    lineHeight: 78,
  },
  range: {
    color: colors.mute,
    fontSize: 13,
    marginTop: -6,
  },
  iqrWrap: {
    marginTop: 4,
    height: 28,
    position: 'relative',
    justifyContent: 'center',
  },
  iqrTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(11,11,15,0.15)',
  },
  iqrMarker: {
    position: 'absolute',
    top: 7,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.coral,
    marginLeft: -6,
    shadowColor: colors.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  iqrEnds: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iqrEndText: { color: colors.mute, fontSize: 11, fontFamily: fontFamily.mono },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(11,11,15,0.04)',
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  statLabel: { color: colors.mute, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 2 },
});
