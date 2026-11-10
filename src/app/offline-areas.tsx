import { OfflineManager, type OfflinePack } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { CloudOff, MapPinned, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/ui';
import { MAX_OFFLINE_BYTES } from '@/features/map/offline';
import { colors, radius, space, touch, type } from '@/theme';

/** One saved area: its packs (normal map + satellite share metadata.group; older saves are a single pack). */
type Area = {
  key: string; packs: OfflinePack[]; name: string; savedAt: string | null; bytes: number; percent: number; complete: boolean;
  satellite: boolean;
};

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

async function fetchAreas(): Promise<Area[]> {
  const packs = await OfflineManager.getPacks();
  const withStatus = await Promise.all(packs.map(async (pack) => ({ pack, status: await pack.status() })));
  const groups = new Map<string, typeof withStatus>();
  for (const p of withStatus) {
    const key = String(p.pack.metadata?.group ?? p.pack.id);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const areas = [...groups].map(([key, items]): Area => {
    const meta = items[0].pack.metadata ?? {};
    return {
      key,
      packs: items.map((i) => i.pack),
      name: String(meta.name ?? 'Saved area'),
      savedAt: (meta.savedAt as string | undefined) ?? null,
      bytes: items.reduce((n, i) => n + i.status.completedResourceSize, 0),
      percent: Math.round(items.reduce((n, i) => n + i.status.percentage, 0) / items.length),
      complete: items.every((i) => i.status.state === 'complete'),
      satellite: items.some((i) => i.pack.metadata?.kind === 'satellite'),
    };
  });
  return areas.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
}

/** Map areas saved for offline use (MapLibre offline packs): see size, jump to one, or delete it. */
export default function OfflineAreas() {
  const [areas, setAreas] = useState<Area[] | null>(null);

  const [version, setVersion] = useState(0); // bump to reload after a delete
  useEffect(() => {
    let alive = true;
    fetchAreas()
      .catch(() => [] as Area[])
      .then((rows) => alive && setAreas(rows));
    return () => {
      alive = false;
    };
  }, [version]);

  const remove = (a: Area) =>
    Alert.alert(`Delete “${a.name}”?`, 'You’ll need signal to see this map again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const p of a.packs) await OfflineManager.deletePack(p.id);
          setVersion((v) => v + 1);
        },
      },
    ]);

  const show = (a: Area) => router.navigate({ pathname: '/map', params: { focus: a.packs[0].bounds.join(',') } });
  const total = (areas ?? []).reduce((n, a) => n + a.bytes, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Saved areas" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: space.xxl }}>
        {areas && areas.length === 0 ? (
          <EmptyState icon={CloudOff} title="No saved areas" body="On the map, tap “Save area” to use part of the map without signal." />
        ) : null}
        {areas && areas.length > 0 ? (
          <Text style={type.secondary}>{areas.length} area{areas.length > 1 ? 's' : ''}  ·  {mb(total)} of {mb(MAX_OFFLINE_BYTES)} used</Text>
        ) : null}
        {(areas ?? []).map((a) => (
          <View key={a.key} style={styles.row}>
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => show(a)} accessibilityLabel={`Show ${a.name} on the map`}>
              <Text style={type.headline} numberOfLines={1}>{a.name}</Text>
              <Text style={type.secondary}>
                {[
                  a.complete ? mb(a.bytes) : `Downloading ${a.percent}%`,
                  a.satellite ? 'map and satellite' : 'map only',
                  a.savedAt ? new Date(a.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : null,
                ].filter(Boolean).join('  ·  ')}
              </Text>
            </Pressable>
            <Pressable style={styles.icon} onPress={() => show(a)} accessibilityLabel="Show on map">
              <MapPinned size={20} color={colors.text} />
            </Pressable>
            <Pressable style={styles.icon} onPress={() => remove(a)} accessibilityLabel={`Delete ${a.name}`}>
              <Trash2 size={20} color={colors.danger} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: space.md,
  },
  icon: { width: touch, height: touch, borderRadius: touch / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
