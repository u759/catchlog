import { router } from 'expo-router';
import { ChevronRight, CirclePlus, CloudOff, CloudUpload, Fish, History, MapPin, Star } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { CatchPhoto } from '@/components/CatchPhoto';
import { Button, Card, Chip, EmptyState, StatTile } from '@/components/ui';
import {
  type LogbookFilter,
  refreshSync,
  useBestCatch,
  useLogbook,
  useLogbookStats,
  usePendingUploads,
} from '@/features/catches/hooks';
import { type CatchView, parseTs, speciesLabel } from '@/features/catches/model';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, type Units, weightUnit } from '@/utils/units';

const PAGE = 30;

function whenLabel(iso: string) {
  const d = parseTs(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Logbook() {
  const units = useUnits();
  const [filter, setFilter] = useState<LogbookFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  // All reads are local SQLite (works offline). The list pages in PAGE rows at a time.
  const { catches, isLoading } = useLogbook(filter, limit);
  const stats = useLogbookStats();
  const best = useBestCatch();
  const sync = usePendingUploads();

  const changeFilter = (f: LogbookFilter) => {
    setFilter(f);
    setLimit(PAGE);
  };

  const header = (
    <View style={{ gap: space.lg }}>
      {sync.count > 0 && (
        <View style={styles.syncBanner}>
          {sync.connected ? (
            <CloudUpload size={16} color={colors.onAccent} />
          ) : (
            <CloudOff size={16} color={colors.onAccent} />
          )}
          <Text style={styles.syncText}>
            {sync.connected
              ? `Syncing ${sync.count} change${sync.count > 1 ? 's' : ''}…`
              : `${sync.count} change${sync.count > 1 ? 's' : ''} saved offline. Will sync when you’re back online.`}
          </Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatTile label="Total caught" value={String(stats.total)} unit="fish" />
        <StatTile label="Today" value={`+${stats.today}`} unit="fresh" />
        <StatTile label="Total weight" value={formatWeight(stats.weight ?? 0, units)} unit={weightUnit(units)} />
      </View>

      <View style={styles.chips}>
        <Chip label="All Species" selected={filter === 'all'} onPress={() => changeFilter('all')} />
        <Chip label="Today" selected={filter === 'today'} onPress={() => changeFilter('today')} />
        <Chip label="★ Trophies" selected={filter === 'trophies'} onPress={() => changeFilter('trophies')} />
      </View>

      {best && filter === 'all' && <FeaturedCatch c={best} units={units} />}

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
        data={catches}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <CatchRow c={item} units={units} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: space.md }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (filter !== 'trophies' && catches.length >= limit) setLimit((l) => l + PAGE);
        }}
        ListEmptyComponent={
          isLoading || (!sync.hasSynced && sync.connected) ? (
            <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={type.muted}>Downloading your logbook…</Text>
            </View>
          ) : !sync.hasSynced && stats.total === 0 ? (
            <EmptyState
              icon={CloudOff}
              title="Waiting for a connection"
              body="Connect to the internet once to download your logbook. You can still log new catches now. They'll sync later."
            />
          ) : stats.total === 0 ? (
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
        refreshControl={<RefreshControl refreshing={sync.syncing} onRefresh={refreshSync} tintColor={colors.primary} />}
      />
    </View>
  );
}

function FeaturedCatch({ c, units }: { c: CatchView; units: Units }) {
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
            <CatchPhoto photoPath={c.photo_path} style={styles.featuredPhoto} />
            <View style={styles.bestBadge}>
              <Text style={styles.bestText}>BEST</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={type.heading} numberOfLines={2}>
              {speciesLabel(c)}
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

function CatchRow({ c, units }: { c: CatchView; units: Units }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <CatchPhoto photoPath={c.photo_path} style={styles.rowPhoto} iconSize={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {speciesLabel(c)}
        </Text>
        <Text style={type.muted} numberOfLines={1}>
          {[c.waterbody ?? c.place_name, whenLabel(c.caught_at)].filter(Boolean).join(' • ')}
        </Text>
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
  syncText: { color: colors.onAccent, fontWeight: '600', fontSize: 13, flex: 1 },
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
});
