import { OfflineManager, type OfflinePack } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { CloudOff, MapPinned, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/ui';
import { MAX_OFFLINE_BYTES } from '@/features/map/offline';
import { colors, radius, space, type } from '@/theme';

type Area = { pack: OfflinePack; name: string; savedAt: string | null; bytes: number; percent: number; complete: boolean };

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

async function fetchAreas(): Promise<Area[]> {
  const packs = await OfflineManager.getPacks();
  const rows = await Promise.all(
    packs.map(async (pack) => {
      const s = await pack.status();
      return {
        pack,
        name: String(pack.metadata?.name ?? 'Saved area'),
        savedAt: (pack.metadata?.savedAt as string | undefined) ?? null,
        bytes: s.completedResourceSize,
        percent: Math.round(s.percentage),
        complete: s.state === 'complete',
      };
    }),
  );
  return rows.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
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
    Alert.alert(`Delete “${a.name}”?`, 'The map here will no longer show without signal.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await OfflineManager.deletePack(a.pack.id);
          setVersion((v) => v + 1);
        },
      },
    ]);

  const show = (a: Area) => router.navigate({ pathname: '/map', params: { focus: a.pack.bounds.join(',') } });
  const total = (areas ?? []).reduce((n, a) => n + a.bytes, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Saved areas" back />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        {areas && areas.length === 0 ? (
          <EmptyState icon={CloudOff} title="No saved areas" body="On the map, zoom to where you'll fish and tap “Save area” to use it without signal." />
        ) : null}
        {areas && areas.length > 0 ? (
          <Text style={type.muted}>{areas.length} area{areas.length > 1 ? 's' : ''} · {mb(total)} of {mb(MAX_OFFLINE_BYTES)} used</Text>
        ) : null}
        {(areas ?? []).map((a) => (
          <View key={a.pack.id} style={styles.row}>
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => show(a)} accessibilityLabel={`Show ${a.name} on the map`}>
              <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
              <Text style={type.muted}>
                {a.complete ? mb(a.bytes) : `Downloading ${a.percent}%`}
                {a.savedAt ? ` · saved ${new Date(a.savedAt).toLocaleDateString()}` : ''}
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
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
