/**
 * WorthIt brand tokens.
 *
 * Source: Brand system.html (uploads — see personal/app-machine/design/worthit.md).
 * Update cadence: changes only via a brand-system revision + decisions.md entry.
 *
 * Day 2 uses the system font with weight 700 as a stand-in for Inter 700.
 * Day 3+: load Inter via expo-font for the wordmark + JetBrains Mono for price numerals.
 */

export const colors = {
  ink: '#0B0B0F',
  inkSoft: '#1A1A22',
  paper: '#F4F1EA',
  paperDim: '#E7E2D7',
  coral: '#FF6B4A',
  coralDeep: '#C8421F',
  lilac: '#B8A4FF',
  green: '#C6F84E',
  mute: '#6B7280',
  muteLight: '#A0A0A8',
  border: '#2A2A33',
  error: '#FF5252',
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSizes = {
  micro: 11,
  caption: 13,
  body: 15,
  sub: 17,
  title: 22,
  h2: 28,
  h1: 36,
  price: 56,
  priceBig: 72,
} as const;

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  bold: '700' as const,
};

// System-font stand-ins. Replace with real families once expo-font loads them (Day 3+).
export const fontFamily = {
  sans: undefined as string | undefined, // system default (San Francisco on iOS)
  mono: 'Menlo' as const, // system mono stand-in until JetBrains Mono loads
};

export const shadow = {
  lift: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
};
