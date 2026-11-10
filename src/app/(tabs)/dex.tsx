import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Fish, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Badge, Chip, EmptyState, Segmented } from '@/components/ui';
import { localPhotoUri } from '@/features/catches/photos';
import { environmentLabel } from '@/features/collection/fishbaseLabels';
import { type DexEntry, useDex } from '@/features/collection/hooks';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, space, type } from '@/theme';
import { formatLength, lengthUnit } from '@/utils/units';

type Scope = 'lakes' | 'all';

/** Fish you could actually meet: recorded in a lake on this phone, or already caught by you. */
const inYourLakes = (e: DexEntry) => e.lakes > 0 || e.caught > 0;

export default function Dex() {
  const { entries } = useDex();
  const units = useUnits();
  const lakeCount = useMemo(() => entries.filter(inYourLakes).length, [entries]);
  const [scopeChoice, setScope] = useState<Scope | null>(null);
  const scope: Scope = scopeChoice ?? (lakeCount > 0 ? 'lakes' : 'all');
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const inScope = useMemo(() => (scope === 'lakes' ? entries.filter(inYourLakes) : entries), [entries, scope]);
  const caughtCount = inScope.filter((e) => e.caught > 0).length;
  // Groups are FishBase families (by their common name), most species first.
  const groupsPresent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of inScope) if (e.family_common) counts.set(e.family_common, (counts.get(e.family_common) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [inScope]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter(
      (e) =>
        (!group || e.family_common === group) &&
        (!q || e.common_name.toLowerCase().includes(q) || String(e.dex_no) === q.replace(/^#|^no\.?\s*/i, '')),
    );
  }, [inScope, group, query]);

  const progress = inScope.length ? caughtCount / inScope.length : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Dex" />
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl }}
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.sm }}>
            <View style={{ gap: space.sm }}>
              <Text style={type.body}>
                <Text style={type.headline}>{caughtCount}</Text> of {inScope.length} {scope === 'lakes' ? 'lake fish' : 'species'} caught
              </Text>
              <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: inScope.length, now: caughtCount }}>
                <View style={[styles.barFill, { width: `${Math.max(progress * 100, caughtCount ? 2 : 0)}%` }]} />
              </View>
            </View>
            {lakeCount > 0 && (
              <Segmented
                options={[
                  { value: 'lakes', label: `In your lakes (${lakeCount})` },
                  { value: 'all', label: 'All species' },
                ]}
                value={scope}
                onChange={(v) => {
                  setScope(v);
                  setGroup(null);
                }}
              />
            )}
            <View style={styles.search}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                placeholder="Search by name or number"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                accessibilityLabel="Search species"
                clearButtonMode="while-editing"
              />
            </View>
            {groupsPresent.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
                <Chip label="All families" selected={!group} onPress={() => setGroup(null)} />
                {groupsPresent.map((g) => (
                  <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(g)} />
                ))}
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon={Fish} title="No fish match" body={query ? 'Try another name or a Dex number.' : 'Log a catch to start your collection.'} />
        }
        renderItem={({ item }) => <DexCard entry={item} units={units} />}
      />
    </View>
  );
}

function DexCard({ entry: e, units }: { entry: DexEntry; units: ReturnType<typeof useUnits> }) {
  const found = e.caught > 0;
  const photo = (found && localPhotoUri(e.best_photo)) || null;
  const image = photo ?? e.thumb;
  const sub = found
    ? e.pb_length_mm != null
      ? `Best ${formatLength(e.pb_length_mm, units)} ${lengthUnit(units)}`
      : `Caught ${e.caught}×`
    : e.lakes > 0
      ? `In ${e.lakes} lake${e.lakes > 1 ? 's' : ''}`
      : (environmentLabel(e.environment) ?? e.family_common ?? '');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${e.common_name}, number ${e.dex_no}, ${found ? `caught ${e.caught} times` : 'not caught yet'}`}
      onPress={() => router.push({ pathname: '/species/[id]', params: { id: e.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.imageBox}>
        {image ? (
          <Image source={{ uri: image }} style={[StyleSheet.absoluteFill, !found && styles.uncaught]} contentFit="cover" cachePolicy="disk" />
        ) : (
          <Fish size={28} color={colors.textMuted} />
        )}
        {found && (
          <Badge label={`${e.caught}×`} style={styles.caughtBadge} />
        )}
      </View>
      <Text style={type.caption}>No. {String(e.dex_no).padStart(3, '0')}</Text>
      <Text style={[type.headline, !found && { color: colors.textMuted }]} numberOfLines={2}>
        {e.common_name}
      </Text>
      <Text style={type.secondary} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: space.md, minHeight: 48,
  },
  searchInput: { ...type.body, flex: 1, paddingVertical: space.sm },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 2 },
  imageBox: {
    aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center', marginBottom: space.sm,
  },
  uncaught: { opacity: 0.35 },
  caughtBadge: { position: 'absolute', top: space.sm, right: space.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
});
