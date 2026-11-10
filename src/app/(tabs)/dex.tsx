import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Fish } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Badge, Dropdown, EmptyState, SearchField } from '@/components/ui';
import { useLocalPhotoUri } from '@/lib/sync/photos';
import { matchSpecies, useSpeciesIndex } from '@/features/catches/speciesSearch';
import { environmentLabel } from '@/features/collection/fishbaseLabels';
import { usePendingUploads } from '@/features/catches/hooks';
import { type DexEntry, NEAR_KM, useDex, useLakeRegions, useNearbySpecies } from '@/features/collection/hooks';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, space, type } from '@/theme';
import { formatLength, lengthUnit } from '@/utils/units';

type Scope = 'near' | 'lakes' | 'all';

/** Fish recorded in a lake on this phone, or already caught by you. */
const inLakes = (e: DexEntry) => e.lakes > 0 || e.caught > 0;

export default function Dex() {
  const { entries } = useDex();
  const units = useUnits();
  const sync = usePendingUploads();
  const regions = useLakeRegions();
  const regionLabel = regions.length ? `${regions.join(' + ')} lakes` : 'Lakes';

  // Your position (last known; asks for location permission the first time).
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      const granted = perm.granted || (perm.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
      if (!granted) return;
      const p = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (alive && p) setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const nearby = useNearbySpecies(here);

  const lakeCount = useMemo(() => entries.filter(inLakes).length, [entries]);
  const nearCount = useMemo(() => (nearby.size ? entries.filter((e) => nearby.has(e.id) || e.caught > 0).length : 0), [entries, nearby]);
  const [scopeChoice, setScope] = useState<Scope | null>(null);
  const scope: Scope = scopeChoice ?? (nearCount > 0 ? 'near' : lakeCount > 0 ? 'lakes' : 'all');
  // First open: lake data hasn't arrived yet.
  const waitingForData = !sync.hasSynced && sync.connected && lakeCount === 0;
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const speciesIndex = useSpeciesIndex();

  // Near me / lakes views put your fish first, then the most widespread (where you're most likely to meet them);
  // "All" stays in Dex-number order.
  const inScope = useMemo(() => {
    if (waitingForData) return [];
    if (scope === 'near') {
      return entries
        .filter((e) => nearby.has(e.id) || e.caught > 0)
        .sort((a, b) => Number(b.caught > 0) - Number(a.caught > 0) || (nearby.get(b.id) ?? 0) - (nearby.get(a.id) ?? 0) || a.dex_no - b.dex_no);
    }
    if (scope === 'lakes') {
      return entries.filter(inLakes).sort((a, b) => Number(b.caught > 0) - Number(a.caught > 0) || b.lakes - a.lakes || a.dex_no - b.dex_no);
    }
    return entries;
  }, [entries, scope, nearby, waitingForData]);
  const caughtCount = inScope.filter((e) => e.caught > 0).length;
  // Groups are FishBase families (by their common name), most species first.
  const groupsPresent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of inScope) if (e.family_common) counts.set(e.family_common, (counts.get(e.family_common) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [inScope]);

  const visible = useMemo(() => {
    const inGroup = inScope.filter((e) => !group || e.family_common === group);
    const q = query.trim();
    if (!q) return inGroup;
    // A Dex number ("12", "#12", "No. 12"), otherwise the shared fuzzy species match, best match first.
    const no = q.replace(/^#|^no\.?\s*/i, '');
    if (/^\d+$/.test(no)) return inGroup.filter((e) => String(e.dex_no) === String(Number(no)));
    const rank = new Map(matchSpecies(speciesIndex, q, 200).map((id, i) => [id, i]));
    return inGroup.filter((e) => rank.has(e.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  }, [inScope, group, query, speciesIndex]);

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
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.xs }}>
            <View style={styles.row}>
              <Text style={[type.body, { flex: 1 }]} accessibilityLabel={`${caughtCount} of ${inScope.length} caught`}>
                <Text style={type.headline}>{caughtCount}</Text> of {inScope.length} caught
              </Text>
              {lakeCount > 0 && (
                <Dropdown
                  neutral
                  accessibilityLabel="Which fish"
                  options={[
                    ...(nearCount > 0 ? [{ value: 'near' as Scope, label: 'Near me', detail: `${nearCount} · ${NEAR_KM} km` }] : []),
                    { value: 'lakes' as Scope, label: regionLabel, detail: String(lakeCount) },
                    { value: 'all' as Scope, label: 'All species', detail: entries.length.toLocaleString() },
                  ]}
                  value={scope}
                  onChange={(v) => {
                    setScope(v);
                    setGroup(null);
                  }}
                />
              )}
            </View>
            <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: inScope.length, now: caughtCount }}>
              <View style={[styles.barFill, { width: `${Math.max(progress * 100, caughtCount ? 2 : 0)}%` }]} />
            </View>
            {waitingForData && (
              <View style={styles.row}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[type.secondary, { flex: 1, color: colors.text }]}>Getting lake data…</Text>
              </View>
            )}
            {!waitingForData && lakeCount === 0 && !sync.connected && (
              <Text style={[type.secondary, { color: colors.text }]}>Connect once to see which fish live in your lakes.</Text>
            )}
            <View style={styles.row}>
              <SearchField placeholder="Name or number" value={query} onChangeText={setQuery} accessibilityLabel="Search species" />
              {groupsPresent.length > 1 && (
                <Dropdown
                  accessibilityLabel="Family"
                  options={[
                    { value: null as string | null, label: 'All families' },
                    ...groupsPresent.map((g) => ({ value: g as string | null, label: g })),
                  ]}
                  value={group}
                  onChange={setGroup}
                  buttonStyle={{ maxWidth: 150, minHeight: 44 }}
                />
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          waitingForData ? undefined : <EmptyState icon={Fish} title="No fish match" body={query ? 'Try another name or a Dex number.' : 'Log a catch to start your collection.'} />
        }
        renderItem={({ item }) => <DexCard entry={item} units={units} nearLakes={scope === 'near' ? (nearby.get(item.id) ?? 0) : null} />}
      />
    </View>
  );
}

function DexCard({ entry: e, units, nearLakes }: { entry: DexEntry; units: ReturnType<typeof useUnits>; nearLakes: number | null }) {
  const found = e.caught > 0;
  const ownPhoto = useLocalPhotoUri(e.best_photo);
  const photo = (found && ownPhoto) || null;
  const image = photo ?? e.thumb;
  const sub = found
    ? e.pb_length_mm != null
      ? `Best ${formatLength(e.pb_length_mm, units)} ${lengthUnit(units)}`
      : `Caught ${e.caught}×`
    : nearLakes
      ? `In ${nearLakes} lake${nearLakes > 1 ? 's' : ''} near you`
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
          <Image source={{ uri: image }} style={[StyleSheet.absoluteFill, !found && styles.uncaught]} contentFit="cover" cachePolicy="disk"
            recyclingKey={e.id} transition={120} />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 2 },
  imageBox: {
    aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center', marginBottom: space.sm,
  },
  uncaught: { opacity: 0.35 },
  caughtBadge: { position: 'absolute', top: space.sm, right: space.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
});
