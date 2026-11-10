import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowLeft, Fish, Trophy, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '@/features/profile/hooks';
import { colors, space } from '@/theme';

/** Tab screens: brand + title + leaderboard/profile shortcuts. Stack screens: pass `back`. */
export function AppHeader({ title, right, back }: { title: string; right?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  return (
    <View style={[styles.row, { paddingTop: insets.top + space.sm }]}>
      {back ? (
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.brand}>
          <Fish size={22} color={colors.primary} />
          <Text style={styles.brandText}>CatchLog</Text>
        </View>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {right}
      {!back && (
        <>
          <Pressable onPress={() => router.push('/leaderboard')} hitSlop={8} accessibilityLabel="Leaderboard" style={styles.icon}>
            <Trophy size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/profile')} hitSlop={8} accessibilityLabel="Profile">
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <User size={18} color={colors.textMuted} />
              </View>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.bg,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 20, fontWeight: '800', color: colors.text },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, flexShrink: 1 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
