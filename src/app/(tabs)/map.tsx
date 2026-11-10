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
import { router, useLocalSearchParams } from 'expo-router';
import { CloudDownload, Layers, LocateFixed } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, Chip } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import {
  MAX_OFFLINE_BYTES, maxHalfSpan, MIN_DETAIL_ZOOM, offlineBytes, PACK_MIN_ZOOM, packMaxZoom, squareBounds,
} from '@/features/map/offline';
import { useSpots } from '@/features/spots/hooks';
import { parseTs } from '@/features/catches/model';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, shadow, space } from '@/theme';

// OpenFreeMap: free vector tiles, attribution shown by the map.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const WORLD: [number, number] = [0, 20]; // initial view when the phone has no location yet

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
  // /map?focus=w,s,e,n (from Saved areas): zoom to that area once the map is up.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  useEffect(() => {
    if (!focus || !start) return;
    const b = focus.split(',').map(Number);
    if (b.length !== 4 || b.some((v) => !Number.isFinite(v))) return;
    const t = setTimeout(() => {
      camera.current?.fitBounds(b as [number, number, number, number], { padding: { top: 40, right: 40, bottom: 40, left: 40 } });
      router.setParams({ focus: undefined });
    }, 300);
    return () => clearTimeout(t);
  }, [focus, start]);

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
      .then((p) => setStart(p ? [p.coords.longitude, p.coords.latitude] : WORLD))
      .catch(() => setStart(WORLD));
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
        .filter((c) => (!species || c.species_id === species) && parseTs(c.caught_at).getTime() >= cutoff)
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

  // "Save area": a square frame in the middle of the map; the user pans/zooms the map under it. The frame
  // shrinks when zoomed out so it never covers more than can be saved with street-level detail.
  const [selecting, setSelecting] = useState(false);
  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null);
  const frame = useMemo(() => {
    if (!view || !mapSize) return null;
    const lngPerPx = (view.bounds[2] - view.bounds[0]) / mapSize.width;
    if (!(lngPerPx > 0)) return null;
    const center = view.center as [number, number];
    const maxPx = (2 * maxHalfSpan(center)) / lngPerPx;
    const side = Math.min(0.8 * Math.min(mapSize.width, mapSize.height), maxPx);
    const bounds = squareBounds(center, (side / 2) * lngPerPx);
    const km = (bounds[2] - bounds[0]) * 111.32 * Math.cos((center[1] * Math.PI) / 180);
    return { side, bounds, km, tooSmall: side < 48 };
  }, [view, mapSize]);

  const startSelecting = async () => {
    if ((await offlineBytes().catch(() => 0)) >= MAX_OFFLINE_BYTES) {
      return Alert.alert('Offline storage full', `Saved areas are limited to ${MAX_OFFLINE_BYTES / 1_048_576} MB. Delete one first.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Saved areas', onPress: () => router.push('/offline-areas') },
      ]);
    }
    if (view && (view.bearing !== 0 || view.pitch !== 0)) camera.current?.easeTo({ center: view.center, bearing: 0, pitch: 0, duration: 300 });
    setSelecting(true);
  };

  const saveFrame = async () => {
    if (!frame || frame.tooSmall) return;
    const bounds = frame.bounds;
    const maxZoom = packMaxZoom(bounds);
    if (maxZoom < MIN_DETAIL_ZOOM) return;
    setSelecting(false);
    setDownloading(0);
    try {
      // Name the area after the place at its centre (saving needs signal anyway); the date is shown separately.
      const [place] = await Location.reverseGeocodeAsync({
        latitude: (bounds[1] + bounds[3]) / 2, longitude: (bounds[0] + bounds[2]) / 2,
      }).catch(() => []);
      const name = place?.city ?? place?.subregion ?? place?.region ?? 'Saved area';
      await OfflineManager.createPack(
        { mapStyle: STYLE_URL, bounds, minZoom: PACK_MIN_ZOOM, maxZoom, metadata: { name, savedAt: new Date().toISOString() } },
        (_pack, status) => {
          setDownloading(Math.round(status.percentage));
          if (status.state === 'complete') {
            setDownloading(null);
            Alert.alert('Saved for offline', `${name} will show without signal.`);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Map" />
      <View style={{ flex: 1 }} onLayout={(e) => setMapSize(e.nativeEvent.layout)}>
        {start && (
          <MapView
            style={StyleSheet.absoluteFill}
            mapStyle={STYLE_URL}
            onRegionDidChange={(e) => setView(e.nativeEvent)}
            onRegionIsChanging={selecting ? (e) => setView(e.nativeEvent) : undefined}
            touchRotate={!selecting}
            touchPitch={!selecting}
            onLongPress={(e) => {
              if (selecting) return;
              const [lng, lat] = e.nativeEvent.lngLat;
              router.push({ pathname: '/spot/edit', params: { lat: String(lat), lng: String(lng) } });
            }}>
            <Camera ref={camera} initialViewState={{ center: start, zoom: start === WORLD ? 1 : 11 }} />
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

        {selecting ? (
          <>
            {frame && !frame.tooSmall ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={[styles.mask, { flex: 1 }]} />
                <View style={{ flexDirection: 'row', height: frame.side }}>
                  <View style={[styles.mask, { flex: 1 }]} />
                  <View style={[styles.frame, { width: frame.side, height: frame.side }]} />
                  <View style={[styles.mask, { flex: 1 }]} />
                </View>
                <View style={[styles.mask, { flex: 1 }]} />
              </View>
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.mask]} pointerEvents="none" />
            )}
            <View style={styles.selectBar}>
              <Text style={styles.selectText}>
                {!frame || frame.tooSmall
                  ? 'Zoom in to choose an area'
                  : `Move the map to fit the square · ${Math.round(frame.km)} × ${Math.round(frame.km)} km`}
              </Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Cancel" variant="secondary" onPress={() => setSelecting(false)} style={{ flex: 1 }} />
                <Button label="Save this area" icon={CloudDownload} onPress={saveFrame} disabled={!frame || frame.tooSmall}
                  style={{ flex: 1 }} />
              </View>
            </View>
          </>
        ) : (
          <>
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
            <Pressable style={styles.fab} onPress={() => router.push('/offline-areas')} accessibilityLabel="Saved areas">
              <Layers size={22} color={colors.text} />
            </Pressable>
            <Pressable style={styles.fab} onPress={recenter} accessibilityLabel="My location">
              <LocateFixed size={22} color={colors.text} />
            </Pressable>
            <Pressable style={[styles.fab, styles.fabWide]} onPress={startSelecting} disabled={downloading !== null}
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
          <Text style={styles.hint} pointerEvents="none">Long-press to save a spot</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { position: 'absolute', top: space.md, left: 0, right: 0 },
  actions: { position: 'absolute', right: space.lg, bottom: space.xl + space.lg, gap: space.md, alignItems: 'flex-end' }, // clear of the ⓘ attribution button
  fab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    ...shadow,
  },
  fabWide: { width: undefined, flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.primary,
    borderRadius: radius.pill },
  fabText: { color: colors.onPrimary, fontWeight: '700' },
  // Below the filter chips, clear of the map attribution in the bottom corners.
  mask: { backgroundColor: 'rgba(0,0,0,0.35)' },
  frame: { borderWidth: 2, borderColor: '#ffffff', borderRadius: 4 },
  selectBar: {
    position: 'absolute', left: space.lg, right: space.lg, bottom: space.xl + space.lg, gap: space.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, ...shadow,
  },
  selectText: { fontSize: 13, color: colors.text, textAlign: 'center' },
  hint: { position: 'absolute', left: space.lg, top: space.md + 48, fontSize: 11, color: colors.textMuted,
    backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, borderRadius: 4 },
});
