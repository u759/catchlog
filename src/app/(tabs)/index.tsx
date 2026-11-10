import { useIsMutating } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, CirclePlus, CloudUpload, Fish, History, MapPin, Star } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { CatchPhoto } from '@/components/CatchPhoto';
import { Button, Card, Chip, EmptyState, StatTile } from '@/components/ui';
import type { Catch } from '@/features/catches/api';
import { useMyCatches } from '@/features/catches/hooks';
import { useUnits } from '@/features/profile/hooks';
import { MUTATION_SAVE_CATCH } from '@/lib/queryClient';
import { colors, radius, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, type Units, weightUnit } from '@/utils/units';

type Filter = 'all' | 'today' | 'trophies';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const speciesName = (c: Catch) => c.species?.common_name ?? c.species_other ?? 'Unknown species';

function whenLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(iso)) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Logbook() {
  const units = useUnits();
  const { data: catches = [], isRefetching, refetch } = useMyCatches();
  const pendingSync = useIsMutating({ mutationKey: MUTATION_SAVE_CATCH });
  const [filter, setFilter] = useState<Filter>('all');

  const stats = useMemo(
    () => ({
      total: catches.length,
      today: catches.filter((c) => isToday(c.caught_at)).length,
      weight: catches.reduce((sum, c) => sum + (c.weight_g ?? 0), 0),
      best: catches.reduce<Catch | undefined>(
        (best, c) => ((c.length_mm ?? 0) > (best?.length_mm ?? 0) ? c : best),
        undefined,
      ),
    }),
    [catches],
  );

  const visible = useMemo(() => {
    if (filter === 'today') return catches.filter((c) => isToday(c.caught_at));
    if (filter === 'trophies')
      return [...catches].filter((c) => c.length_mm).sort((a, b) => b.length_mm! - a.length_mm!).slice(0, 10);
    return catches;
  }, [catches, filter]);

  const header = (
    <View style={{ gap: space.lg }}>
      {pendingSync > 0 && (
        <View style={styles.syncBanner}>
          <CloudUpload size={16} color={colors.onAccent} />
          <Text style={styles.syncText}>
            {pendingSync} catch{pendingSync > 1 ? 'es' : ''} waiting for signal to sync
          </Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatTile label="Total caught" value={String(stats.total)} unit="fish" />
        <StatTile label="Today" value={`+${stats.today}`} unit="fresh" />
        <StatTile label="Total weight" value={formatWeight(stats.weight, units)} unit={weightUnit(units)} />
      </View>

      <View style={styles.chips}>
        <Chip label="All Species" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Today" selected={filter === 'today'} onPress={() => setFilter('today')} />
        <Chip label="★ Trophies" selected={filter === 'trophies'} onPress={() => setFilter('trophies')} />
      </View>

      {stats.best && filter === 'all' && <FeaturedCatch c={stats.best} units={units} />}

      {catches.length > 0 && (
        <View style={styles.sectionTitle}>
          <History size={18} color={colors.primary} />
          <Text style={type.heading}>{filter === 'trophies' ? 'Top 10 by length' : 'Recent Catches'}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Logbook" />
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <CatchRow c={item} units={units} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: space.md }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          catches.length === 0 ? (
            <EmptyState
              icon={Fish}
              title="No catches yet"
              body="Tap the camera button to log your first fish. It works offline too and syncs when you're back in range."
            />
          ) : (
            <Text style={[type.muted, { textAlign: 'center', padding: space.xl }]}>Nothing here yet.</Text>
          )
        }
        ListFooterComponent={
          <Button
            label="Log New Catch"
            icon={CirclePlus}
            onPress={() => router.push('/catch/new')}
            style={{ marginTop: space.xl }}
          />
        }
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()}tintColor={colors.primary} />}
      />
    </View>
  );
}

function FeaturedCatch({ c, units }: { c: Catch; units: Units }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sectionTitle}>
        <Star size={18} color={colors.primary} />
        <Text style={[type.heading, { flex: 1 }]}>Featured Catch</Text>
        <Text style={type.muted}>{whenLabel(c.caught_at)}</Text>
      </View>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View>
            <CatchPhoto catchId={c.id} photoPath={c.photo_path} photoUrl={c.photo_url} style={styles.featuredPhoto} />
            <View style={styles.bestBadge}>
              <Text style={styles.bestText}>BEST</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={type.heading} numberOfLines={2}>
              {speciesName(c)}
            </Text>
            {(c.place_name || c.waterbody) && (
              <View style={styles.inline}>
                <MapPin size={14} color={colors.textMuted} />
                <Text style={type.muted} numberOfLines={1}>
                  {[c.waterbody, c.place_name].filter(Boolean).join(' • ')}
                </Text>
              </View>
            )}
            <View style={styles.inline}>
              <MiniStat label="Weight" value={formatWeight(c.weight_g, units)} unit={weightUnit(units)} />
              <MiniStat label="Length" value={formatLength(c.length_mm, units)} unit={lengthUnit(units)} />
            </View>
          </View>
        </View>
        <Button
          label="View Details"
          icon={ChevronRight}
          onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}
          style={{ height: 44 }}
        />
      </Card>
    </View>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={type.muted}>{label}</Text>
      <Text style={styles.miniValue}>
        {value}
        <Text style={type.muted}> {unit}</Text>
      </Text>
    </View>
  );
}

function CatchRow({ c, units }: { c: Catch; units: Units }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <CatchPhoto catchId={c.id} photoPath={c.photo_path} photoUrl={c.photo_url} style={styles.rowPhoto} iconSize={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {speciesName(c)}
        </Text>
        <Text style={type.muted} numberOfLines={1}>
          {[c.waterbody ?? c.place_name, whenLabel(c.caught_at)].filter(Boolean).join(' • ')}
        </Text>
        {c._pending && <Text style={styles.pending}>Waiting to sync</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowWeight}>
          {formatWeight(c.weight_g, units)}
          <Text style={type.muted}> {weightUnit(units)}</Text>
        </Text>
        <Text style={type.muted}>
          {formatLength(c.length_mm, units)} {lengthUnit(units)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: space.md,
  },
  syncText: { color: colors.onAccent, fontWeight: '600', fontSize: 13 },
  featuredPhoto: { width: 120, height: 120, borderRadius: radius.md },
  bestBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bestText: { color: colors.onPrimary, fontSize: 11, fontWeight: '800' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  miniStat: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: space.sm },
  miniValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
  },
  rowPhoto: { width: 56, height: 56, borderRadius: radius.sm },
  rowTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  rowWeight: { fontSize: 18, fontWeight: '800', color: colors.text },
  pending: { fontSize: 12, fontWeight: '600', color: colors.onGold },
});
