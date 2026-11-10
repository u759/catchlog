import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  type GeoJSONSourceRef,
  Layer,
  Map as MapView,
  OfflineManager,
  UserLocation,
  type ViewState,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { CloudDownload, LocateFixed } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Chip } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { useSpots } from '@/features/spots/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, shadow, space } from '@/theme';

// OpenFreeMap: free vector tiles, attribution shown by the map. Offline downloads are limited to
// 3,000 tiles each by their terms (https://openfreemap.org/tos/).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAX_PACK_TILES = 3000;
const BC_CENTER: [number, number] = [-123.1, 49.6];

type Range = '30d' | '1y' | 'all';

/** Earliest catch time shown for a date filter (evaluated when the filter is tapped). */
const cutoffFor = (r: Range) => (r === 'all' ? 0 : Date.now() - (r === '30d' ? 30 : 365) * 86_400_000);

export default function MapTab() {
  const userId = useUserId() ?? '';
  const camera = useRef<CameraRef>(null);
  const catchSource = useRef<GeoJSONSourceRef>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [start, setStart] = useState<[number, number] | null>(null);
  const [range, setRange] = useState<Range>('all');
  const [cutoff, setCutoff] = useState(0);
  const pickRange = (r: Range) => {
    setRange(r);
    setCutoff(cutoffFor(r));
  };
  const [species, setSpecies] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const spots = useSpots();

  const { data: catches } = useLiveQuery<{ id: string; lat: number; lng: number; caught_at: string; species_id: string | null;
    name: string; lure: string | null; length_mm: number | null }>(
    `SELECT c.id, c.lat, c.lng, c.caught_at, c.species_id, coalesce(s.common_name, c.species_other, 'Fish') AS name, c.lure, c.length_mm
     FROM catches c LEFT JOIN species s ON s.id = c.species_id
     WHERE c.user_id = ? AND c.lat IS NOT NULL AND c.lng IS NOT NULL`,
    [userId],
    ['catches', 'species'],
  );

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((p) => setStart(p ? [p.coords.longitude, p.coords.latitude] : BC_CENTER))
      .catch(() => setStart(BC_CENTER));
  }, []);

  const speciesChips = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; n: number }>();
    for (const c of catches) {
      if (!c.species_id) continue;
      const e = counts.get(c.species_id) ?? { id: c.species_id, name: c.name, n: 0 };
      e.n += 1;
      counts.set(c.species_id, e);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [catches]);

  const catchGeo = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: catches
        .filter((c) => (!species || c.species_id === species) && Date.parse(c.caught_at.replace(' ', 'T')) >= cutoff)
        .map((c) => ({
          type: 'Feature' as const,
          id: c.id,
          properties: { id: c.id, label: c.lure ? `${c.name} · ${c.lure}` : c.name },
          geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
        })),
    };
  }, [catches, cutoff, species]);

  const spotGeo = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: spots.map((s) => ({
        type: 'Feature' as const,
        id: s.id,
        properties: { id: s.id, label: s.name },
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      })),
    }),
    [spots],
  );

  const recenter = async () => {
    const p = await Location.getLastKnownPositionAsync().catch(() => null);
    if (p) camera.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 13 });
  };

  const downloadArea = async () => {
    if (!view) return;
    const [w, s, e, n] = view.bounds;
    const minZoom = Math.max(0, Math.floor(view.zoom) - 4);
    let maxZoom = 16;
    while (maxZoom > minZoom && tileCount([w, s, e, n], minZoom, maxZoom) > MAX_PACK_TILES) maxZoom -= 1;
    if (maxZoom < Math.ceil(view.zoom)) {
      return Alert.alert('Zoom in a bit', 'This area is too big to save in detail. Zoom in to the lake or area you’ll fish.');
    }
    setDownloading(0);
    try {
      await OfflineManager.createPack(
        { mapStyle: STYLE_URL, bounds: [w, s, e, n], minZoom, maxZoom, metadata: { name: `Area ${new Date().toLocaleDateString()}` } },
        (_pack, status) => {
          setDownloading(Math.round(status.percentage));
          if (status.state === 'complete') {
            setDownloading(null);
            Alert.alert('Saved for offline', `This area (zoom ${minZoom}–${maxZoom}) will show without signal.`);
          }
        },
        (_pack, err) => {
          setDownloading(null);
          Alert.alert('Download failed', err.message);
        },
      );
    } catch (err) {
      setDownloading(null);
      Alert.alert('Download failed', String(err));
    }
  };

  const manageAreas = async () => {
    const packs = await OfflineManager.getPacks();
    if (!packs.length) return Alert.alert('No offline areas', 'Use “Save area” to keep the visible map for offline use.');
    Alert.alert(`${packs.length} offline area${packs.length > 1 ? 's' : ''}`, undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          for (const p of packs) await OfflineManager.deletePack(p.id);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Map" />
      <View style={{ flex: 1 }}>
        {start && (
          <MapView
            style={StyleSheet.absoluteFill}
            mapStyle={STYLE_URL}
            onRegionDidChange={(e) => setView(e.nativeEvent)}
            onLongPress={(e) => {
              const [lng, lat] = e.nativeEvent.lngLat;
              router.push({ pathname: '/spot/edit', params: { lat: String(lat), lng: String(lng) } });
            }}>
            <Camera ref={camera} initialViewState={{ center: start, zoom: start === BC_CENTER ? 5 : 11 }} />
            <UserLocation accuracy heading />
            <GeoJSONSource
              id="catches"
              ref={catchSource}
              data={catchGeo}
              cluster
              clusterRadius={40}
              clusterMaxZoom={14}
              onPress={async (e) => {
                const f = e.nativeEvent.features[0];
                if (!f) return;
                const props = f.properties ?? {};
                if (props.cluster) {
                  const zoom = await catchSource.current?.getClusterExpansionZoom(Number(props.cluster_id));
                  const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
                  camera.current?.easeTo({ center: [lng, lat], zoom: zoom ?? 14 });
                } else if (props.id) {
                  router.push({ pathname: '/catch/[id]', params: { id: String(props.id) } });
                }
              }}>
              <Layer
                id="catch-clusters"
                type="circle"
                filter={['has', 'point_count']}
                paint={{ 'circle-color': colors.primary, 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
                  'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }}
              />
              <Layer
                id="catch-cluster-count"
                type="symbol"
                filter={['has', 'point_count']}
                layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-font': ['Noto Sans Bold'] }}
                paint={{ 'text-color': '#ffffff' }}
              />
              <Layer
                id="catch-points"
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={{ 'circle-color': colors.primary, 'circle-radius': 8, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }}
              />
              <Layer
                id="catch-labels"
                type="symbol"
                filter={['!', ['has', 'point_count']]}
                minzoom={12}
                layout={{ 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top',
                  'text-font': ['Noto Sans Regular'] }}
                paint={{ 'text-color': colors.text, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }}
              />
            </GeoJSONSource>
            <GeoJSONSource
              id="spots"
              data={spotGeo}
              onPress={(e) => {
                const id = e.nativeEvent.features[0]?.properties?.id;
                if (id) router.push({ pathname: '/spot/edit', params: { id: String(id) } });
              }}>
              <Layer id="spot-points" type="circle"
                paint={{ 'circle-color': colors.onGold, 'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }} />
              <Layer id="spot-labels" type="symbol" minzoom={10}
                layout={{ 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top',
                  'text-font': ['Noto Sans Bold'] }}
                paint={{ 'text-color': colors.onGold, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }} />
            </GeoJSONSource>
          </MapView>
        )}

        <View style={styles.filters} pointerEvents="box-none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
            {(['all', '1y', '30d'] as Range[]).map((r) => (
              <Chip key={r} label={r === 'all' ? 'All time' : r === '1y' ? 'This year' : '30 days'} selected={range === r} onPress={() => pickRange(r)} />
            ))}
            <Chip label="All species" selected={!species} onPress={() => setSpecies(null)} />
            {speciesChips.map((s) => (
              <Chip key={s.id} label={`${s.name} (${s.n})`} selected={species === s.id} onPress={() => setSpecies(s.id)} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.fab} onPress={recenter} accessibilityLabel="My location">
            <LocateFixed size={22} color={colors.text} />
          </Pressable>
          <Pressable style={[styles.fab, styles.fabWide]} onPress={downloadArea} onLongPress={manageAreas} disabled={downloading !== null}
            accessibilityLabel="Save visible area for offline">
            {downloading !== null ? (
              <>
                <ActivityIndicator color={colors.onPrimary} />
                <Text style={styles.fabText}>{downloading}%</Text>
              </>
            ) : (
              <>
                <CloudDownload size={20} color={colors.onPrimary} />
                <Text style={styles.fabText}>Save area</Text>
              </>
            )}
          </Pressable>
        </View>
        <Text style={styles.hint}>Long-press the map to save a spot · long-press “Save area” to manage</Text>
      </View>
    </View>
  );
}

/** Number of web-mercator tiles covering bounds over a zoom range. */
function tileCount([w, s, e, n]: [number, number, number, number], minZ: number, maxZ: number) {
  const x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const y = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  let total = 0;
  for (let z = minZ; z <= maxZ; z++) total += (Math.abs(x(e, z) - x(w, z)) + 1) * (Math.abs(y(s, z) - y(n, z)) + 1);
  return total;
}

const styles = StyleSheet.create({
  filters: { position: 'absolute', top: space.md, left: 0, right: 0 },
  actions: { position: 'absolute', right: space.lg, bottom: space.xl, gap: space.md, alignItems: 'flex-end' },
  fab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    ...shadow,
  },
  fabWide: { width: undefined, flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.primary,
    borderRadius: radius.pill },
  fabText: { color: colors.onPrimary, fontWeight: '700' },
  hint: { position: 'absolute', left: space.lg, bottom: space.sm, fontSize: 11, color: colors.textMuted,
    backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, borderRadius: 4 },
});
