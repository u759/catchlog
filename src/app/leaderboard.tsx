import { router } from 'expo-router';
import { Trophy, Users } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { AppHeader } from '@/components/AppHeader';
import { Button, Chip, EmptyState } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { type LeaderboardPeriod, useLeaderboard } from '@/features/leaderboard/hooks';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

const rankColors: Record<number, { bg: string; fg: string }> = {
  1: { bg: colors.gold, fg: colors.onGold },
  2: { bg: '#E7E9EC', fg: '#5B6168' },
  3: { bg: '#F5E1D3', fg: '#9A5A2E' },
};

export default function Leaderboard() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('year');
  const units = useUnits();
  const me = useUserId();
  const { data: pages, isRefetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useLeaderboard(period);
  const data = pages?.pages.flat() ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Leaderboard" back />
      <FlatList
        data={data}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <View style={styles.chips}>
              {PERIODS.map((p) => (
                <Chip key={p.key} label={p.label} selected={period === p.key} onPress={() => setPeriod(p.key)} />
              ))}
            </View>
            <Text style={type.muted}>Longest fish per angler — you, your friends, and public catches.</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Trophy}
            title="No ranked catches yet"
            body="Log a catch with a length, then add friends from your Profile to compete."
            action={<Button label="Add friends" icon={Users} variant="accent" onPress={() => router.push('/profile')} />}
          />
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === me;
          const rc = rankColors[item.rank] ?? { bg: colors.surfaceAlt, fg: colors.textMuted };
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/catch/[id]', params: { id: item.catch_id } })}
              style={[styles.row, isMe && styles.rowMe]}>
              <View style={[styles.rank, { backgroundColor: isMe ? colors.primary : rc.bg }]}>
                <Text style={[styles.rankText, { color: isMe ? colors.onPrimary : rc.fg }]}>{item.rank}</Text>
              </View>
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url, cacheKey: item.photo_path }} style={styles.thumb} />
              ) : item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {isMe ? 'You' : (item.display_name ?? 'Angler')}
                </Text>
                <Text style={type.muted} numberOfLines={1}>
                  {item.species_name ?? 'Unknown species'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.length}>
                  {formatLength(item.length_mm, units)}
                  <Text style={type.muted}> {lengthUnit(units)}</Text>
                </Text>
                {item.weight_g ? (
                  <Text style={type.muted}>
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
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
  },
  rowMe: { backgroundColor: '#F1F6E4', borderLeftWidth: 4, borderLeftColor: colors.primary },
  rank: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 16, fontWeight: '800' },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  length: { fontSize: 20, fontWeight: '800', color: colors.text },
});
