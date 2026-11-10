import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check, FileDown, Map as MapIcon, Waves } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, EmptyState, Facts, Group, Row, Section } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { useUnits } from '@/features/profile/hooks';
import { isDepthMapSaved, openDepthMap, useWaterbody, useWaterbodySpecies } from '@/features/waterbodies/hooks';
import { useLakeGauges, useWaterNow, type WaterNow } from '@/features/waterbodies/waterNow';
import { fmtTime } from '@/features/astro/astro';
import { formatTemp } from '@/features/weather/openMeteo';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, space, type } from '@/theme';
import { depthUnit, formatDepth, formatFlow, formatLevel, formatLevelChange, type Units } from '@/utils/units';

export default function LakeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lake = useWaterbody(id);
  const species = useWaterbodySpecies(id);
  const userId = useUserId() ?? '';
  const units = useUnits();
  const { data: mine } = useLiveQuery<{ n: number }>(
    'SELECT count(*) AS n FROM catches WHERE user_id = ? AND waterbody_id = ? AND deleted_at IS NULL',
    [userId, id ?? ''],
    ['catches'],
  );
  const [opening, setOpening] = useState<string | null>(null);
  const gauges = useLakeGauges(id);
  const water = useWaterNow(gauges[0]);

  if (!lake) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader back />
        <EmptyState icon={Waves} title="Lake not on this phone yet" body="Connect to the internet once to download lake data." />
      </View>
    );
  }

  const open = async (url: string) => {
    setOpening(url);
    try {
      await openDepthMap(url);
    } catch {
      Alert.alert('Couldn’t open the map', 'The first time you open a map, you need signal.');
    } finally {
      setOpening(null);
    }
  };
  const caught = mine[0]?.n ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader back />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={{ gap: space.xs }}>
          <Text style={type.title}>{lake.name ?? 'Unnamed lake'}</Text>
          <Facts
            items={[
              lake.max_depth_m != null && `${formatDepth(lake.max_depth_m, units)} ${depthUnit(units)} deep`,
              lake.mean_depth_m != null && `mean ${formatDepth(lake.mean_depth_m, units)} ${depthUnit(units)}`,
              lake.area_ha != null && `${lake.area_ha.toFixed(lake.area_ha < 10 ? 1 : 0)} ha`,
              caught > 0 && `${caught} of your catches`,
            ]}
          />
        </View>

        {gauges.length > 0 && (
          <Section title="Water now">
            {water.data ? (
              <WaterNowRows w={water.data} units={units} />
            ) : (
              <Text style={type.secondary}>
                {water.isError ? 'Needs signal to read the gauge.' : 'Reading the gauge…'}
              </Text>
            )}
            <Text style={type.caption}>
              {[water.data && `${water.data.station} gauge`, latestReading(water.data) && fmtTime(latestReading(water.data)),
                'provisional data, Environment and Climate Change Canada'].filter(Boolean).join(' · ')}
            </Text>
          </Section>
        )}

        <Section title="Depth maps">
          {lake.depth_maps.length === 0 && !lake.has_contours ? (
            <Text style={type.secondary}>No official depth map for this lake.</Text>
          ) : (
            <Group>
              {lake.has_contours && lake.west != null ? (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.mapRow, pressed && { opacity: 0.6 }]}
                  onPress={() =>
                    router.push({ pathname: '/map', params: { focus: [lake.west, lake.south, lake.east, lake.north].join(',') } })
                  }>
                  <MapIcon size={20} color={colors.primary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.body} numberOfLines={1}>Depth contours on the map</Text>
                    <Text style={type.secondary}>Saved on this phone once shown</Text>
                  </View>
                </Pressable>
              ) : null}
              {lake.depth_maps.map((m) => (
                <Pressable
                  key={m.url}
                  accessibilityRole="button"
                  accessibilityLabel={`Open depth map ${m.title || ''}`}
                  style={({ pressed }) => [styles.mapRow, pressed && { opacity: 0.6 }]}
                  onPress={() => open(m.url)}
                  disabled={opening === m.url}>
                  <FileDown size={20} color={colors.primary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.body} numberOfLines={1}>{m.title || 'Depth map'}</Text>
                    <Text style={type.secondary}>{isDepthMapSaved(m.url) ? 'Saved on this phone' : 'Downloads when opened'}</Text>
                  </View>
                  {opening === m.url ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : isDepthMapSaved(m.url) ? (
                    <Check size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </Group>
          )}
          <Text style={type.caption}>Not for navigation · Open Government Licence – BC</Text>
        </Section>

        <Section title={species.length ? `Fish recorded here (${species.length})` : 'Fish recorded here'}>
          {species.length === 0 ? (
            <Text style={type.secondary}>No fish recorded here yet.</Text>
          ) : (
            <Group>
              {species.map((s) => (
                <Pressable
                  key={s.species_id}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.speciesRow, pressed && { opacity: 0.6 }]}
                  onPress={() => router.push({ pathname: '/species/[id]', params: { id: s.species_id } })}>
                  {s.thumb ? (
                    <Image source={{ uri: s.thumb }} style={styles.thumb} cachePolicy="disk" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.body}>{s.common_name}</Text>
                    <Text style={type.secondary}>
                      {[s.mine > 0 ? 'You’ve caught it here' : null, s.last_observed ? `last recorded ${s.last_observed.slice(0, 4)}` : null]
                        .filter(Boolean).join('  ·  ') || `No. ${String(s.dex_no).padStart(3, '0')}`}
                    </Text>
                  </View>
                  {s.mine > 0 && <Check size={18} color={colors.primary} />}
                </Pressable>
              ))}
            </Group>
          )}
          <Text style={type.caption}>Known BC Fish Observations · Open Government Licence – BC</Text>
        </Section>

        <Section title="Stocking">
          <Group>
            <Row label="Stocking history on GoFishBC" onPress={() => WebBrowser.openBrowserAsync('https://www.gofishbc.com/stocked-fish/')} />
          </Group>
        </Section>

        {caught > 0 ? null : (
          <Button label="Log a catch here" variant="secondary" onPress={() => router.push({ pathname: '/catch/new', params: { lake: lake.id } })} />
        )}
      </ScrollView>
    </View>
  );
}

const latestReading = (w: WaterNow | undefined) =>
  [w?.temp_c?.at, w?.level_m?.at, w?.flow_m3s?.at].reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);

/** Latest gauge readings, one row each (the gauge and time are in the caption under the group). */
function WaterNowRows({ w, units }: { w: WaterNow; units: Units }) {
  const since = (r: { value: number; dayAgo: number | null }) =>
    r.dayAgo != null ? `${formatLevelChange(r.value - r.dayAgo, units)} since yesterday` : null;
  const rows = [
    w.temp_c && { label: 'Water temperature', value: formatTemp(w.temp_c.value, units), sub: null, at: w.temp_c.at },
    w.level_m && { label: 'Water level', value: formatLevel(w.level_m.value, units), sub: since(w.level_m), at: w.level_m.at },
    w.flow_m3s && { label: 'Flow', value: formatFlow(w.flow_m3s.value, units), sub: null, at: w.flow_m3s.at },
  ].filter((r): r is { label: string; value: string; sub: string | null; at: Date } => !!r);
  if (!rows.length) return <Text style={type.secondary}>The gauge has no readings in the last day.</Text>;
  return (
    <Group>
      {rows.map((r) => (
        <Row key={r.label} label={r.label} value={r.value} sub={r.sub} />
      ))}
    </Group>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl * 2 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.md },
  speciesRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
});
