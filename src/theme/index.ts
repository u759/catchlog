// CatchLog design tokens. See DESIGN.md ("The Tackle Box"): forest ink on warm paper, flat, system font,
// seven text roles. Screens use these tokens only; no raw sizes or hex values.
import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#F4F5F0', // Paper: page background
  surface: '#FFFFFF', // grouped rows, unit cards, inputs
  surfaceAlt: '#EEF1EA', // Sunken: secondary buttons, segmented track, image placeholders
  primary: '#1C3A2E', // Forest: the only interactive tint
  primaryPressed: '#14291F',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#C9D6CE', // secondary text on Forest (sign-in)
  onPrimaryDanger: '#FFB4AB', // errors on Forest (sign-in)
  accent: '#D8E9A8', // Lime: personal highlights only (new species, personal best)
  onAccent: '#2F4A14',
  text: '#15201A', // Ink
  textMuted: '#5C665F', // Ink, muted (≥ 5.2:1 on every surface)
  border: '#E3E7E0', // Hairline dividers
  borderStrong: '#CDD3C9', // Outline: inputs, unselected chips
  danger: '#B3261E',
  gold: '#F6E7C8', // Spot gold: saved spots only
  onGold: '#9A6B12',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** Minimum touch target (iOS 44pt; Android asks 48dp, reached with hitSlop where needed). */
export const touch = 44;

const t = (s: TextStyle) => s;

/** The seven text roles. Text scales with the OS text-size setting (React Native default). */
export const type = {
  largeTitle: t({ fontSize: 30, lineHeight: 36, fontWeight: '700', color: colors.text }),
  title: t({ fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.text }),
  headline: t({ fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text }),
  body: t({ fontSize: 16, lineHeight: 22, fontWeight: '400', color: colors.text }),
  secondary: t({ fontSize: 14, lineHeight: 19, fontWeight: '400', color: colors.textMuted }),
  caption: t({ fontSize: 13, lineHeight: 17, fontWeight: '500', color: colors.textMuted }),
  stat: t({ fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }),
};

/**
 * Motion tokens (milliseconds). Motion lives in the shared components (Segmented, Sheet, Dropdown) and list
 * layout transitions (`listItemLayout`), built on Reanimated 4: CSS transitions for state changes, layout
 * animations for lists. Never hand-roll animations in screens. Enter ease-out, exit ease-in; Reduce Motion is
 * honoured app-wide (ReducedMotionConfig in the root layout + useReducedMotion in components).
 */
export const motion = {
  fast: 160, // menus, small state changes
  base: 220, // sliding selections
  slow: 280, // sheets entering
  exitFast: 120,
  exit: 200,
} as const;

/** Map float: the only shadow in the system, for controls over map imagery. */
export const floating = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;
