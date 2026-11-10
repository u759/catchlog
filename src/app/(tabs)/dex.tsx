import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Crown, HelpCircle, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Chip, EmptyState } from '@/components/ui';
import { localPhotoUri } from '@/features/catches/photos';
import { type DexEntry, useDex } from '@/features/collection/hooks';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, shadow, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

type Scope = 'bc' | 'canada' | 'game' | 'caught';
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'bc', label: 'BC' },
  { key: 'game', label: 'Game fish' },
  { key: 'canada', label: 'All Canada' },
  { key: 'caught', label: 'Caught' },
];

const inBC = (e: DexEntry) => e.regions.includes('BC') || e.regions.includes('PAC');

export default function Dex() {
  const { entries } = useDex();
  const units = useUnits();
  const [scope, setScope] = useState<Scope>('bc');
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const inScope = useMemo(
    () =>
      entries.filter((e) => {
        if (scope === 'bc') return inBC(e);
        if (scope === 'game') return e.game_fish && (inBC(e) || e.caught > 0);
        if (scope === 'caught') return e.caught > 0;
        return e.in_canada;
      }),
    [entries, scope],
  );
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
        (!q || (e.caught > 0 && e.common_name.toLowerCase().includes(q)) || String(e.dex_no) === q ||
          (e.caught === 0 && q.length > 3 && e.common_name.toLowerCase().includes(q))),
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
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <View style={styles.progressCard}>
              <Text style={type.label}>SPECIES COLLECTION</Text>
              <Text style={styles.progressText}>
                {caughtCount} <Text style={type.muted}>of {inScope.length} found</Text>
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.max(progress * 100, caughtCount ? 2 : 0)}%` }]} />
              </View>
            </View>
            <View style={styles.search}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                placeholder="Search your fish or a Dex number"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>
            <View style={styles.chips}>
              {SCOPES.map((s) => (
                <Chip key={s.key} label={s.label} selected={scope === s.key} onPress={() => { setScope(s.key); setGroup(null); }} />
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <Chip label="All groups" selected={!group} onPress={() => setGroup(null)} />
              {groupsPresent.map((g) => (
                <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(g)} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon={HelpCircle} title="Nothing here yet" body="Log a catch to add it to your collection." />
        }
        renderItem={({ item }) => (
          <DexCard entry={item} lengthText={item.pb_length_mm != null ? `${formatLength(item.pb_length_mm, units)} ${lengthUnit(units)}` : null}
            weightText={item.pb_weight_g != null ? `${formatWeight(item.pb_weight_g, units)} ${weightUnit(units)}` : null} />
        )}
      />
    </View>
  );
}

function DexCard({ entry: e, lengthText, weightText }: { entry: DexEntry; lengthText: string | null; weightText: string | null }) {
  const found = e.caught > 0;
  const photo = (found && localPhotoUri(e.best_photo)) || null;
  const image = photo ?? e.thumb;
  const hint = e.lakes > 0 ? `Recorded in ${e.lakes} lake${e.lakes > 1 ? 's' : ''}` : e.environment ? `Lives ${e.environment}` : e.family_common;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/species/[id]', params: { id: e.id } })}
      style={({ pressed }) => [styles.card, !found && styles.cardMystery, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardTop}>
        <Text style={styles.dexNo}>#{String(e.dex_no).padStart(3, '0')}</Text>
        {found && e.caught > 0 && <Crown size={14} color={colors.onGold} />}
      </View>
      <View style={styles.imageBox}>
        {image ? (
          <Image source={{ uri: image }} style={[StyleSheet.absoluteFill, !found && styles.silhouette]} contentFit="cover"
            cachePolicy="disk" />
        ) : (
          <HelpCircle size={28} color={colors.textMuted} />
        )}
        {!found && (
          <View style={styles.mysteryOverlay}>
            <Text style={styles.mysteryMark}>?</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {found ? e.common_name : 'Not yet caught'}
      </Text>
      {found ? (
        <Text style={type.muted} numberOfLines={1}>
          {[lengthText, weightText].filter(Boolean).join(' · ') || `Caught ${e.caught}×`}
        </Text>
      ) : (
        <Text style={type.muted} numberOfLines={2}>
          {hint}
        </Text>
      )}
      {found && <Text style={styles.count}>Caught {e.caught}×</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  progressCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...shadow },
  progressText: { fontSize: 26, fontWeight: '800', color: colors.text },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 4, ...shadow },
  cardMystery: { backgroundColor: colors.surfaceAlt, shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dexNo: { fontSize: 13, fontWeight: '800', color: colors.primary },
  imageBox: {
    height: 96, borderRadius: radius.md, backgroundColor: colors.bg, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center', marginVertical: 4,
  },
  silhouette: { opacity: 0.08 },
  mysteryOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mysteryMark: { fontSize: 40, fontWeight: '800', color: colors.textMuted },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  count: { fontSize: 12, fontWeight: '700', color: colors.onAccent },
});
