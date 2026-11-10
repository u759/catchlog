import type { LucideIcon } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
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

import { colors, radius, shadow, space, type } from '@/theme';

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Button ────────────────────────────────────────────────────────────────
type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, icon: Icon, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {Icon && <Icon size={18} color={v.fg} />}
          <Text style={[styles.buttonLabel, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.primary, fg: colors.onPrimary },
  accent: { bg: colors.accent, fg: colors.onAccent },
  secondary: { bg: colors.surfaceAlt, fg: colors.text },
  ghost: { bg: 'transparent', fg: colors.textMuted },
};

// ── Chip ──────────────────────────────────────────────────────────────────
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Text style={[styles.chipLabel, selected && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

// ── StatTile ──────────────────────────────────────────────────────────────
export function StatTile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.label}>{label.toUpperCase()}</Text>
      <Text style={type.stat} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      {sub ? <Text style={type.muted}>{sub}</Text> : null}
    </View>
  );
}

// ── Section ───────────────────────────────────────────────────────────────
export function Section({
  title,
  icon: Icon,
  right,
  children,
}: PropsWithChildren<{ title: string; icon?: LucideIcon; right?: ReactNode }>) {
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.sectionHeader}>
        {Icon && <Icon size={20} color={colors.primary} />}
        <Text style={[type.heading, { flex: 1 }]}>{title}</Text>
        {right}
      </View>
      {children}
    </Card>
  );
}

// ── InfoPill (icon + label/value block used in Conditions/Tackle) ─────────
export function InfoPill({ icon: Icon, label, value }: { icon: LucideIcon; label?: string; value: string }) {
  return (
    <View style={styles.infoPill}>
      <Icon size={18} color={colors.primary} />
      <View style={{ flexShrink: 1 }}>
        {label ? <Text style={type.muted}>{label}</Text> : null}
        <Text style={[type.body, { fontWeight: '600' }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────
export function Field({ label, suffix, ...props }: TextInputProps & { label: string; suffix?: string }) {
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <Text style={type.label}>{label.toUpperCase()}</Text>
      <View style={styles.inputWrap}>
        <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />
        {suffix ? <Text style={type.muted}>{suffix}</Text> : null}
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
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.muted, { textAlign: 'center', maxWidth: 280 }]}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, ...shadow },
  button: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  chip: {
    paddingHorizontal: space.lg,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
    ...shadow,
  },
  statUnit: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  infoPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: space.md,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: space.md },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
