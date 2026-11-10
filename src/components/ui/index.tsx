import type { LucideIcon } from 'lucide-react-native';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react-native';
import {
  Children,
  type ComponentRef,
  Fragment,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';

import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, floating, motion, radius, space, touch, type } from '@/theme';

// Components follow DESIGN.md ("The Tackle Box"): flat, forest is the only interactive tint, system text roles.

// ── Card: one tappable unit (a catch, a species, a saved area). Flat Surface. ──
export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Button ────────────────────────────────────────────────────────────────
type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  /** primary: the one main action · secondary: second action · text: tertiary · danger: destructive text */
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, icon: Icon, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        v.filled ? null : styles.buttonText,
        { backgroundColor: pressed && variant === 'primary' ? colors.primaryPressed : v.bg, opacity: disabled ? 0.4 : pressed && !v.filled ? 0.6 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {Icon && <Icon size={20} color={v.fg} />}
          <Text style={[type.headline, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.primary, fg: colors.onPrimary, filled: true },
  secondary: { bg: colors.surfaceAlt, fg: colors.text, filled: true },
  text: { bg: 'transparent', fg: colors.primary, filled: false },
  danger: { bg: 'transparent', fg: colors.danger, filled: false },
};

// ── Chip: filter or pick ──────────────────────────────────────────────────
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && { color: colors.onPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Segmented control: 2–3 mutually exclusive settings ────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  // The selected pill slides between segments: a CSS transition on its position (Reanimated 4).
  const reduceMotion = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = trackW ? (trackW - SEG_PAD * 2) / options.length : 0;

  return (
    <View style={styles.segTrack} accessibilityRole="tablist" onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      {segW > 0 && (
        <Animated.View
          style={[
            styles.segThumb,
            {
              width: segW,
              transform: [{ translateX: index * segW }],
              transitionProperty: 'transform',
              transitionDuration: reduceMotion ? 0 : motion.base,
              transitionTimingFunction: 'ease-out',
            },
          ]}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, on && segW === 0 && styles.segOn]}>
            <Text style={[styles.segLabel, !on && { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const SEG_PAD = 3;

// ── Section: a headline on the page, content below (no box) ───────────────
export function Section({ title, right, children, style }: PropsWithChildren<{ title?: string; right?: ReactNode; style?: ViewStyle }>) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      {title || right ? (
        <View style={styles.sectionHeader}>
          {title ? (
            <Text style={[type.headline, { flex: 1 }]} accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// ── Group: related rows in one Surface with hairline dividers ─────────────
export function Group({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={styles.divider} />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

// ── Row: label (+ subtitle) on the left, value / chevron on the right ─────
export function Row({
  label,
  sub,
  value,
  icon: Icon,
  onPress,
  right,
  numberOfLines = 1,
}: {
  label: string;
  sub?: string | null;
  value?: string | null;
  icon?: LucideIcon;
  onPress?: () => void;
  right?: ReactNode;
  numberOfLines?: number;
}) {
  const body = (
    <>
      {Icon && <Icon size={20} color={colors.textMuted} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body} numberOfLines={numberOfLines}>
          {label}
        </Text>
        {sub ? <Text style={type.secondary}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[type.body, styles.rowValue]}>{value}</Text> : null}
      {right}
      {onPress ? <ChevronRight size={18} color={colors.textMuted} /> : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

// ── Badge: lime personal highlight (new species, personal best, caught count). The only use of lime. ──
export function Badge({ label, style }: { label: string; style?: ViewStyle }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

// ── Facts: a quiet one-line summary of several values ("0.91 kg · 11.2 cm") ─
export function Facts({ items, style }: { items: (string | null | undefined | false)[]; style?: ViewStyle }) {
  const shown = items.filter(Boolean) as string[];
  if (!shown.length) return null;
  return (
    <View style={style}>
      <Text style={type.secondary}>{shown.join('  ·  ')}</Text>
    </View>
  );
}

// ── Sheet: a bottom sheet for a small, self-contained choice (map layers) ──
// The backdrop fades in place while only the panel slides up (or just fades, with Reduce Motion). Both are CSS
// transitions on an `entered` flag. `children` may be a function receiving `close(after?)`, which animates out
// before acting.
type Close = (after?: () => void) => void;
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode | ((close: Close) => ReactNode);
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [height, setHeight] = useState(600);
  const duration = reduceMotion ? 0 : entered ? motion.slow : motion.exit;
  const easing = entered ? 'ease-out' : 'ease-in';

  const close: Close = (after) => {
    setEntered(false);
    setTimeout(() => {
      onClose();
      after?.();
    }, reduceMotion ? 0 : motion.exit);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onShow={() => setEntered(true)} onRequestClose={() => close()}
      statusBarTranslucent>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop,
          { opacity: entered ? 1 : 0, transitionProperty: 'opacity', transitionDuration: duration, transitionTimingFunction: easing }]}>
        <Pressable style={{ flex: 1 }} onPress={() => close()} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + space.lg,
            transform: [{ translateY: entered || reduceMotion ? 0 : height }],
            opacity: reduceMotion && !entered ? 0 : 1,
            transitionProperty: ['transform', 'opacity'],
            transitionDuration: reduceMotion ? motion.fast : duration,
            transitionTimingFunction: easing,
          },
        ]}
        accessibilityViewIsModal>
        <View style={styles.sheetHeader}>
          <Text style={[type.headline, { flex: 1 }]} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={() => close()} accessibilityRole="button" accessibilityLabel="Close" style={styles.sheetClose}>
            <X size={20} color={colors.text} />
          </Pressable>
        </View>
        {typeof children === 'function' ? children(close) : children}
      </Animated.View>
    </Modal>
  );
}

// ── Dropdown: a menu anchored under its button (map species filter, Dex view and family) ──
export function Dropdown<T extends string | null>({
  options,
  value,
  onChange,
  accessibilityLabel,
  buttonStyle,
  selectedButtonStyle,
  neutral,
}: {
  options: { value: T; label: string; detail?: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
  buttonStyle?: ViewStyle;
  selectedButtonStyle?: ViewStyle;
  /** A view switch rather than a filter: never shows the "filter active" fill. */
  neutral?: boolean;
}) {
  const button = useRef<ComponentRef<typeof View>>(null);
  const reduceMotion = useReducedMotion();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [entered, setEntered] = useState(false);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const current = options.find((o) => o.value === value);
  const active = !neutral && value !== options[0]?.value;

  const show = () => button.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const hide = (after?: () => void) => {
    setEntered(false);
    setTimeout(() => {
      setAnchor(null);
      after?.();
    }, reduceMotion ? 0 : motion.exitFast);
  };

  const menuW = Math.min(260, screenW - space.lg * 2);
  const left = anchor ? Math.max(space.lg, Math.min(anchor.x + anchor.w - menuW, screenW - menuW - space.lg)) : 0;
  const top = anchor ? anchor.y + anchor.h + space.xs : 0;

  return (
    <>
      <Pressable
        ref={button}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: !!anchor }}
        style={[styles.dropButton, buttonStyle, active && [styles.dropButtonOn, selectedButtonStyle]]}>
        <Text style={[styles.dropLabel, active && { color: colors.onPrimary }]} numberOfLines={1}>
          {current?.label}
        </Text>
        <ChevronDown size={16} color={active ? colors.onPrimary : colors.text} />
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onShow={() => setEntered(true)} onRequestClose={() => hide()}
        statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => hide()} accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.menu,
            {
              top,
              left,
              width: menuW,
              maxHeight: Math.max(160, screenH - top - space.xxl * 2),
              opacity: entered ? 1 : 0,
              transform: [{ translateY: entered || reduceMotion ? 0 : -6 }, { scale: entered || reduceMotion ? 1 : 0.97 }],
              transitionProperty: ['opacity', 'transform'],
              transitionDuration: reduceMotion ? 0 : entered ? motion.fast : motion.exitFast,
              transitionTimingFunction: entered ? 'ease-out' : 'ease-in',
            },
          ]}
          accessibilityViewIsModal>
          <ScrollView bounces={false}>
            {options.map((o, i) => (
              <Pressable
                key={String(o.value ?? '__all')}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: o.value === value }}
                onPress={() => hide(() => onChange(o.value))}
                style={({ pressed }) => [styles.menuItem, i > 0 && styles.menuDivider, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.detail ? <Text style={type.secondary}>{o.detail}</Text> : null}
                <View style={{ width: 20 }}>{o.value === value ? <Check size={18} color={colors.primary} /> : null}</View>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

// ── Tip: a one-time hint with a dismiss action ──
export function Tip({ text, onDismiss, style }: { text: string; onDismiss: () => void; style?: ViewStyle }) {
  return (
    <View style={[styles.tip, style]} accessibilityLiveRegion="polite">
      <Text style={[type.secondary, { flex: 1, color: colors.text }]}>{text}</Text>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss tip" style={styles.tipButton}>
        <Text style={[type.headline, { color: colors.primary }]}>Got it</Text>
      </Pressable>
    </View>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────
export function Field({ label, suffix, onFocus, onBlur, ...props }: TextInputProps & { label: string; suffix?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <Text style={type.caption}>{label}</Text>
      <View style={[styles.inputWrap, focused && { borderColor: colors.primary }]}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {suffix ? <Text style={type.caption}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon size={28} color={colors.primary} />
      </View>
      <Text style={[type.headline, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.secondary, { textAlign: 'center', maxWidth: 300 }]}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { minHeight: touch, paddingHorizontal: space.md },
  chip: {
    paddingHorizontal: space.lg,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  segTrack: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: SEG_PAD },
  segThumb: { position: 'absolute', top: SEG_PAD, bottom: SEG_PAD, left: SEG_PAD, backgroundColor: colors.surface, borderRadius: radius.md - 2 },
  seg: { flex: 1, minHeight: 38, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segOn: { backgroundColor: colors.surface },
  segLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.lg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.md },
  rowValue: { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: space.md },
  badge: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, alignSelf: 'flex-start' },
  badgeText: { ...type.caption, fontWeight: '600', color: colors.onAccent },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg,
    paddingTop: space.sm, gap: space.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', minHeight: touch },
  sheetClose: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  dropButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: space.md,
    borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
  },
  dropButtonOn: { backgroundColor: colors.primary },
  dropLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text, flexShrink: 1 },
  menu: {
    position: 'absolute', backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden',
    ...floating,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg },
  menuDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tip: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingLeft: space.lg, paddingVertical: space.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  tipButton: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.lg },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Layout transition for single-column lists whose rows change (filters, deletes): rows slide to new positions. */
export const listItemLayout = LinearTransition.duration(motion.base);
