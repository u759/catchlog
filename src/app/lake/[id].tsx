import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check, ExternalLink, FileDown, Fish, Layers, Waves } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState, Section, StatTile } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { useUnits } from '@/features/profile/hooks';
import { isDepthMapSaved, openDepthMap, useWaterbody, useWaterbodySpecies } from '@/features/waterbodies/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, space, type } from '@/theme';
import { depthUnit, formatDepth } from '@/utils/units';

export default function LakeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lake = useWaterbody(id);
  const species = useWaterbodySpecies(id);
  const userId = useUserId() ?? '';
  const units = useUnits();
  const { data: mine } = useLiveQuery<{ n: number }>(
    'SELECT count(*) AS n FROM catches WHERE user_id = ? AND waterbody_id = ?',
    [userId, id ?? ''],
    ['catches'],
  );
  const [opening, setOpening] = useState<string | null>(null);

  if (!lake) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader title="Lake" back />
        <EmptyState icon={Waves} title="Not found" body="This lake isn't downloaded yet. Connect once to sync lake data." />
      </View>
    );
  }

  const open = async (url: string) => {
    setOpening(url);
    try {
      await openDepthMap(url);
    } catch {
      Alert.alert('Couldn’t open the map', 'Depth maps download the first time you open them, so this needs a connection once.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={lake.name ?? 'Unnamed lake'} back />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.stats}>
          <StatTile label="Area" value={lake.area_ha != null ? lake.area_ha.toFixed(lake.area_ha < 10 ? 1 : 0) : '—'} unit="ha" />
          <StatTile label="Max depth" value={formatDepth(lake.max_depth_m, units)} unit={depthUnit(units)} />
          <StatTile label="Your catches" value={String(mine[0]?.n ?? 0)} />
        </View>

        <Section title="Depth maps" icon={Layers}>
          {lake.depth_maps.length === 0 ? (
            <Text style={type.muted}>No official depth map for this lake.</Text>
          ) : (
            lake.depth_maps.map((m) => (
              <Pressable key={m.url} style={styles.mapRow} onPress={() => open(m.url)} disabled={opening === m.url}>
                <FileDown size={18} color={colors.primary} />
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {m.title || 'Depth map'}
                </Text>
                {opening === m.url ? (
                  <ActivityIndicator color={colors.primary} />
                ) : isDepthMapSaved(m.url) ? (
                  <Check size={16} color={colors.primary} />
                ) : null}
              </Pressable>
            ))
          )}
          {lake.mean_depth_m != null && <Text style={type.muted}>Mean depth {formatDepth(lake.mean_depth_m, units)} {depthUnit(units)}.</Text>}
          <Text style={type.muted}>Saved maps open offline. Not for navigation. Open Government Licence – BC.</Text>
        </Section>

        <Section title={`Fish recorded here (${species.length})`} icon={Fish}>
          {species.length === 0 ? (
            <Text style={type.muted}>No fish observations on record.</Text>
          ) : (
            species.map((s) => (
              <Pressable
                key={s.species_id}
                style={styles.speciesRow}
                onPress={() => router.push({ pathname: '/species/[id]', params: { id: s.species_id } })}>
                {s.thumb ? (
                  <Image source={{ uri: s.thumb }} style={styles.thumb} cachePolicy="disk" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '600' }]}>{s.common_name}</Text>
                  <Text style={type.muted}>
                    #{String(s.dex_no).padStart(3, '0')}
                    {s.last_observed ? ` · last recorded ${s.last_observed.slice(0, 4)}` : ''}
                  </Text>
                </View>
                {s.mine > 0 && <Check size={18} color={colors.primary} />}
              </Pressable>
            ))
          )}
          <Text style={type.muted}>Known BC Fish Observations (Open Government Licence – BC)</Text>
        </Section>

        <Pressable style={styles.linkRow} onPress={() => WebBrowser.openBrowserAsync('https://www.gofishbc.com/stocked-fish/')}>
          <ExternalLink size={16} color={colors.primary} />
          <Text style={styles.link}>Stocking history on GoFishBC</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  stats: { flexDirection: 'row', gap: space.sm },
  mapRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: space.md,
  },
  speciesRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'center' },
  link: { color: colors.primary, fontWeight: '600' },
});
