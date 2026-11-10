import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowLeft, Trophy, User, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '@/features/profile/hooks';
import { colors, space, touch, type } from '@/theme';

/**
 * The app's two header kinds (DESIGN.md › Layout):
 * - Top-level tab screens: large title, leaderboard and profile on the right.
 * - Detail screens (`back`): back button with an optional inline title; subject screens (species, lake, catch)
 *   leave the title empty and show the subject's name in the content.
 */
export function AppHeader({ title, right, back }: { title?: string; right?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  if (back) {
    return (
      <View style={[styles.detail, { paddingTop: insets.top + space.xs }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={[type.headline, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">
          {title ?? ''}
        </Text>
        {right}
      </View>
    );
  }
  return (
    <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
      <Text style={[type.largeTitle, { flex: 1 }]} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {right}
      <Pressable onPress={() => router.push('/leaderboard')} accessibilityRole="button" accessibilityLabel="Leaderboard"
        style={[styles.iconButton, styles.round]}>
        <Trophy size={20} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile"
        style={styles.iconButton}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.round]}>
            <User size={20} color={colors.text} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** A round icon button for a tab header's `right` slot, matching the leaderboard and profile buttons. */
export function HeaderButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconButton, styles.round]}>
      <Icon size={20} color={colors.text} />
    </Pressable>
  );
}

/** Modal forms (log a catch, add gear, save a spot): close on the left, centred title. */
export function ModalHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.modal, { paddingTop: Platform.OS === 'android' ? insets.top + space.xs : space.sm }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" style={styles.iconButton}>
        <X size={24} color={colors.text} />
      </Pressable>
      <Text style={[type.headline, { flex: 1, textAlign: 'center' }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.iconButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.xs, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
    backgroundColor: colors.bg,
  },
  iconButton: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  round: { borderRadius: touch / 2, backgroundColor: colors.surfaceAlt },
  avatar: { width: touch, height: touch, borderRadius: touch / 2, alignItems: 'center', justifyContent: 'center' },
});
