import { router } from 'expo-router';
import { CloudOff, CloudUpload, Fish } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { CatchPhoto } from '@/components/CatchPhoto';
import { Badge, Button, Card, EmptyState, Facts, Segmented } from '@/components/ui';
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

const FILTERS: { value: LogbookFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'trophies', label: 'Best 10' },
];

function whenLabel(iso: string) {
  const d = parseTs(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const measures = (c: CatchView, units: Units) => [
  c.weight_g != null && `${formatWeight(c.weight_g, units)} ${weightUnit(units)}`,
  c.length_mm != null && `${formatLength(c.length_mm, units)} ${lengthUnit(units)}`,
];

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
      {stats.total > 0 && (
        <Facts
          items={[
            `${stats.total} fish logged`,
            stats.weight ? `${formatWeight(stats.weight, units)} ${weightUnit(units)} total` : null,
            stats.today > 0 && `${stats.today} today`,
          ]}
        />
      )}

      {sync.count > 0 && (
        <View style={styles.sync} accessibilityLiveRegion="polite">
          {sync.connected ? <CloudUpload size={18} color={colors.primary} /> : <CloudOff size={18} color={colors.primary} />}
          <Text style={[type.secondary, { flex: 1, color: colors.text }]}>
            {sync.connected
              ? `Uploading ${sync.count} change${sync.count > 1 ? 's' : ''}…`
              : `${sync.count} change${sync.count > 1 ? 's' : ''} saved on this phone. They upload when you have signal.`}
          </Text>
        </View>
      )}

      {stats.total > 0 && <Segmented options={FILTERS} value={filter} onChange={changeFilter} />}

      {best && filter === 'all' && <BestCatch c={best} units={units} />}

      {catches.length > 0 && (
        <Text style={type.headline} accessibilityRole="header">
          {filter === 'trophies' ? 'Longest 10' : filter === 'today' ? 'Today' : 'Recent'}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Logbook" />
      <FlatList
        data={catches}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <CatchRow c={item} units={units} first={index === 0} last={index === catches.length - 1} />
        )}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: space.md }}
        ItemSeparatorComponent={() => (
          <View style={styles.separatorWrap}>
            <View style={styles.separator} />
          </View>
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (filter !== 'trophies' && catches.length >= limit) setLimit((l) => l + PAGE);
        }}
        ListEmptyComponent={
          isLoading || (!sync.hasSynced && sync.connected) ? (
            <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={type.secondary}>Downloading your logbook…</Text>
            </View>
          ) : !sync.hasSynced && stats.total === 0 ? (
            <EmptyState
              icon={CloudOff}
              title="Waiting for a connection"
              body="Connect once to download your logbook. You can log new catches now; they upload later."
            />
          ) : stats.total === 0 ? (
            <EmptyState
              icon={Fish}
              title="No catches yet"
              body="Log your first fish with the camera button below. It works without signal and uploads later."
              action={<Button label="Log a catch" onPress={() => router.push('/catch/new')} style={{ alignSelf: 'stretch' }} />}
            />
          ) : (
            <Text style={[type.secondary, { textAlign: 'center', padding: space.xl }]}>
              {filter === 'today' ? 'No catches today yet.' : 'Nothing here yet.'}
            </Text>
          )
        }
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={sync.syncing} onRefresh={refreshSync} tintColor={colors.primary} />}
      />
    </View>
  );
}

/** The lead of the Logbook: your longest fish, photo first. */
function BestCatch({ c, units }: { c: CatchView; units: Units }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Personal best: ${speciesLabel(c)}`}
      onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}
      style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <CatchPhoto photoPath={c.photo_path} style={styles.bestPhoto} iconSize={40} />
        <View style={{ padding: space.lg, gap: space.xs }}>
          <Badge label="Personal best" />
          <Text style={type.title} numberOfLines={2}>
            {speciesLabel(c)}
          </Text>
          <Facts items={[...measures(c, units), c.waterbody ?? c.place_name, whenLabel(c.caught_at)]} />
        </View>
      </Card>
    </Pressable>
  );
}

function CatchRow({ c, units, first, last }: { c: CatchView; units: Units; first: boolean; last: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}
      style={({ pressed }) => [
        styles.row,
        first && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
        last && { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
        pressed && { opacity: 0.7 },
      ]}>
      <CatchPhoto photoPath={c.photo_path} style={styles.rowPhoto} iconSize={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.headline} numberOfLines={1}>
          {speciesLabel(c)}
        </Text>
        <Text style={type.secondary} numberOfLines={1}>
          {[c.waterbody ?? c.place_name, whenLabel(c.caught_at)].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
      <Text style={[type.body, styles.rowMeasure]}>
        {c.length_mm != null ? `${formatLength(c.length_mm, units)} ${lengthUnit(units)}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sync: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bestPhoto: { width: '100%', aspectRatio: 16 / 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowPhoto: { width: 52, height: 52, borderRadius: radius.sm },
  rowMeasure: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  separatorWrap: { backgroundColor: colors.surface, paddingLeft: space.lg + 52 + space.md },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
