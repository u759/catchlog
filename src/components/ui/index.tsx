import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { Children, Fragment, isValidElement, type PropsWithChildren, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, space, touch, type } from '@/theme';

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
  return (
    <View style={styles.segTrack} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, on && styles.segOn]}>
            <Text style={[styles.segLabel, !on && { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  segTrack: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
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
