import { Image } from 'expo-image';
import { Fish, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '@/features/profile/hooks';
import { colors, space } from '@/theme';

export function AppHeader({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  return (
    <View style={[styles.row, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.brand}>
        <Fish size={22} color={colors.primary} />
        <Text style={styles.brandText}>CatchLog</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <User size={18} color={colors.textMuted} />
        </View>
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
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
