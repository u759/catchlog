// Design tokens taken from the Stitch mockups (forest green + lime accent on warm off-white).
export const colors = {
  bg: '#F4F5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EA',
  primary: '#1C3A2E',
  primaryPressed: '#14291F',
  onPrimary: '#FFFFFF',
  accent: '#D8E9A8',
  onAccent: '#2F4A14',
  text: '#15201A',
  textMuted: '#6B756E',
  border: '#E3E7E0',
  danger: '#B3261E',
  gold: '#F6E7C8',
  onGold: '#9A6B12',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const type = {
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted, letterSpacing: 0.4 },
  stat: { fontSize: 24, fontWeight: '800' as const, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;
