import { router } from 'expo-router';
import { Trophy, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';

import { AppHeader } from '@/components/AppHeader';
import { Button, EmptyState, listItemLayout, Segmented } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { type LeaderboardPeriod, useLeaderboard } from '@/features/leaderboard/hooks';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export default function Leaderboard() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('year');
  const units = useUnits();
  const me = useUserId();
  const { data: pages, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useLeaderboard(period);
  const data = pages?.pages.flat() ?? [];
  // Spinner only for a pull (not background refetches).
  const [pulling, setPulling] = useState(false);
  const onPull = () => {
    setPulling(true);
    refetch().finally(() => setPulling(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Leaderboard" back />
      <Animated.FlatList
        data={data}
        itemLayoutAnimation={listItemLayout}
        skipEnteringExitingAnimations
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxl }}
        ItemSeparatorComponent={() => (
          <View style={styles.separatorWrap}>
            <View style={styles.separator} />
          </View>
        )}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.primary} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Segmented options={PERIODS} value={period} onChange={setPeriod} />
            <Text style={type.secondary}>Longest fish per angler: you, your friends, and public catches.</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Trophy}
            title="No ranked catches yet"
            body="Log a catch with a length, then add friends in Profile."
            action={<Button label="Add friends" icon={Users} variant="secondary" onPress={() => router.push('/profile')} />}
          />
        }
        renderItem={({ item, index }) => {
          const isMe = item.user_id === me;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Rank ${item.rank}, ${isMe ? 'you' : (item.display_name ?? 'Angler')}`}
              onPress={() => router.push({ pathname: '/catch/[id]', params: { id: item.catch_id } })}
              style={({ pressed }) => [
                styles.row,
                index === 0 && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
                index === data.length - 1 && { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[type.headline, styles.rank]}>{item.rank}</Text>
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url, cacheKey: item.photo_path }} style={styles.thumb} />
              ) : item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={type.headline} numberOfLines={1}>
                    {isMe ? 'You' : (item.display_name ?? 'Angler')}
                  </Text>
                </View>
                <Text style={type.secondary} numberOfLines={1}>
                  {item.species_name ?? 'Unknown species'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type.headline, { fontVariant: ['tabular-nums'] }]}>
                  {formatLength(item.length_mm, units)} {lengthUnit(units)}
                </Text>
                {item.weight_g ? (
                  <Text style={type.secondary}>
                    {formatWeight(item.weight_g, units)} {weightUnit(units)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rank: { width: 28, textAlign: 'center', color: colors.primary, fontVariant: ['tabular-nums'] },
  thumb: { width: 48, height: 48, borderRadius: radius.sm },
  separatorWrap: { backgroundColor: colors.surface, paddingLeft: space.lg + 28 + space.md },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
