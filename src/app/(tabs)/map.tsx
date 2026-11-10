import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  type GeoJSONSourceRef,
  Layer,
  Map as MapView,
  type MapRef,
  OfflineManager,
  UserLocation,
  type ViewState,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { CloudDownload, Layers, LocateFixed } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, Dropdown, Group, Row, Segmented, Sheet, Tip } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import {
  MAP_STYLE_URL, MAP_VIEW_MAX_ZOOM, MAX_OFFLINE_BYTES, maxHalfSpan, MIN_DETAIL_ZOOM, offlineBytes, PACK_MIN_ZOOM, packMaxZoom, SATELLITE_MAX_ZOOM,
  SATELLITE_STYLE_URL, SATELLITE_VIEW_MAX_ZOOM, squareBounds,
} from '@/features/map/offline';
import { useSpots } from '@/features/spots/hooks';
import { useTip } from '@/features/tips';
import { parseTs } from '@/features/catches/model';
import { db, useLiveQuery } from '@/lib/sync/db';
import { colors, floating, radius, space, type } from '@/theme';

/** Lake outlines: the biggest lakes in view, at any zoom. */
const MAX_LAKE_OUTLINES = 300;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const WORLD: [number, number] = [0, 20]; // initial view when the phone has no location yet

type Range = '30d' | '1y' | 'all';
const RANGES: { value: Range; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '1y', label: 'This year' },
  { value: '30d', label: '30 days' },
];

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
  const [satellite, setSatellite] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selecting, setSelecting] = useState(false); // choosing an area to save
  const [tipVisible, dismissTip] = useTip('map-offline');
  const spots = useSpots();
  const mapRef = useRef<MapRef>(null);
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
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 12);
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

  // Lakes we have data for, outlined (bounding box) so they're visibly tappable. Only lakes intersecting the
  // current view, biggest first, at most MAX_LAKE_OUTLINES; zooming in reveals smaller lakes. Re-queried when the
  // map stops moving (local SQLite, offline).
  const [lakeGeo, setLakeGeo] = useState<GeoJSON.FeatureCollection>(EMPTY);
  const lakeKey = view && !selecting ? view.bounds.map((v) => v.toFixed(3)).join(',') : '';
  useEffect(() => {
    if (!lakeKey) return;
    let alive = true;
    const [w, s, e, n] = lakeKey.split(',').map(Number);
    db.getAllAsync<{ id: string; west: number; south: number; east: number; north: number; area_ha: number | null }>(
      `SELECT id, west, south, east, north, area_ha FROM waterbodies
       WHERE east >= ? AND west <= ? AND north >= ? AND south <= ? AND west IS NOT NULL
       ORDER BY area_ha DESC LIMIT ${MAX_LAKE_OUTLINES}`,
      [w, e, s, n],
    )
      .then((rows) => {
        if (!alive) return;
        setLakeGeo({
          type: 'FeatureCollection',
          features: rows.map((r) => ({
            type: 'Feature',
            id: r.id,
            properties: { id: r.id, area: r.area_ha ?? 0 },
            geometry: {
              type: 'Polygon',
              coordinates: [[[r.west, r.south], [r.east, r.south], [r.east, r.north], [r.west, r.north], [r.west, r.south]]],
            },
          })),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lakeKey]);
  const showLakes = lakeKey !== '';

  // One tap handler, in priority order: catch pins, saved spots, then the smallest lake under the finger.
  const onMapPress = async (point: [number, number]) => {
    const map = mapRef.current;
    if (!map || selecting) return;
    const box: [[number, number], [number, number]] = [[point[0] - 14, point[1] - 14], [point[0] + 14, point[1] + 14]];
    const query = (layers: string[], at: typeof box | [number, number] = box) =>
      map.queryRenderedFeatures(at as never, { layers }).catch(() => [] as GeoJSON.Feature[]);

    const [c] = await query(['catch-clusters', 'catch-points']);
    if (c) {
      const props = c.properties ?? {};
      if (props.cluster) {
        const zoom = await catchSource.current?.getClusterExpansionZoom(Number(props.cluster_id));
        const [lng, lat] = (c.geometry as GeoJSON.Point).coordinates;
        camera.current?.easeTo({ center: [lng, lat], zoom: zoom ?? 14 });
      } else if (props.id) {
        router.push({ pathname: '/catch/[id]', params: { id: String(props.id) } });
      }
      return;
    }
    const [spot] = await query(['spot-points']);
    if (spot?.properties?.id) {
      router.push({ pathname: '/spot/edit', params: { id: String(spot.properties.id) } });
      return;
    }
    if (!showLakes) return;
    const lakes = await query(['lake-fill'], point);
    const lake = lakes.sort((a, b) => Number(a.properties?.area ?? 0) - Number(b.properties?.area ?? 0))[0];
    if (lake?.properties?.id) router.push({ pathname: '/lake/[id]', params: { id: String(lake.properties.id) } });
  };

  const recenter = async () => {
    const p = await Location.getLastKnownPositionAsync().catch(() => null);
    if (p) camera.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 13 });
  };

  // "Save area": a square frame in the middle of the map; the user pans/zooms the map under it. The frame
  // shrinks when zoomed out so it never covers more than can be saved with street-level detail.
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
      // One saved area = two downloads sharing a group id: the normal map and the satellite view.
      const group = `${Date.now()}`;
      const meta = { name, savedAt: new Date().toISOString(), group };
      const parts = [
        { mapStyle: MAP_STYLE_URL, maxZoom, kind: 'map' },
        { mapStyle: SATELLITE_STYLE_URL, maxZoom: SATELLITE_MAX_ZOOM, kind: 'satellite' },
      ];
      const progress = new Map<string, number>();
      let failed = false;
      for (const part of parts) {
        await OfflineManager.createPack(
          { mapStyle: part.mapStyle, bounds, minZoom: PACK_MIN_ZOOM, maxZoom: part.maxZoom, metadata: { ...meta, kind: part.kind } },
          (_pack, status) => {
            progress.set(part.kind, status.state === 'complete' ? 100 : status.percentage);
            const pct = [...progress.values()].reduce((a, b) => a + b, 0) / parts.length;
            setDownloading(Math.round(pct));
            if (!failed && progress.size === parts.length && [...progress.values()].every((v) => v === 100)) {
              setDownloading(null);
              Alert.alert('Area saved', `${name} now works without signal.`);
            }
          },
          (_pack, err) => {
            if (failed) return;
            failed = true;
            setDownloading(null);
            Alert.alert('Couldn’t save this area', 'Check your signal and try again.');
          },
        );
      }
    } catch {
      setDownloading(null);
      Alert.alert('Couldn’t save this area', 'Check your signal and try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Map" />
      <View style={{ flex: 1 }} onLayout={(e) => setMapSize(e.nativeEvent.layout)}>
        {start && (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            onPress={(e) => void onMapPress(e.nativeEvent.point)}
            mapStyle={satellite ? SATELLITE_STYLE_URL : MAP_STYLE_URL}
            onRegionDidChange={(e) => setView(e.nativeEvent)}
            onRegionIsChanging={selecting ? (e) => setView(e.nativeEvent) : undefined}
            touchRotate={!selecting}
            touchPitch={!selecting}
            onLongPress={(e) => {
              if (selecting) return;
              const [lng, lat] = e.nativeEvent.lngLat;
              router.push({ pathname: '/spot/edit', params: { lat: String(lat), lng: String(lng) } });
            }}>
            <Camera ref={camera} initialViewState={{ center: start, zoom: start === WORLD ? 1 : 11 }}
              maxZoom={satellite ? SATELLITE_VIEW_MAX_ZOOM : MAP_VIEW_MAX_ZOOM} />
            <UserLocation accuracy heading />
            <GeoJSONSource id="lakes" data={showLakes ? lakeGeo : EMPTY}>
              <Layer id="lake-fill" type="fill" paint={{ 'fill-color': colors.primary, 'fill-opacity': 0.05 }} />
              <Layer id="lake-outline" type="line"
                paint={{ 'line-color': satellite ? colors.surface : colors.primary, 'line-opacity': satellite ? 0.7 : 0.4, 'line-width': 1.25 }} />
            </GeoJSONSource>
            <GeoJSONSource
              id="catches"
              ref={catchSource}
              data={catchGeo}
              cluster
              clusterRadius={40}
              clusterMaxZoom={14}>
              <Layer
                id="catch-clusters"
                type="circle"
                filter={['has', 'point_count']}
                paint={{ 'circle-color': colors.primary, 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
                  'circle-stroke-width': 3, 'circle-stroke-color': colors.surface }}
              />
              <Layer
                id="catch-cluster-count"
                type="symbol"
                filter={['has', 'point_count']}
                layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-font': ['Noto Sans Bold'] }}
                paint={{ 'text-color': colors.surface }}
              />
              <Layer
                id="catch-points"
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={{ 'circle-color': colors.primary, 'circle-radius': 8, 'circle-stroke-width': 3, 'circle-stroke-color': colors.surface }}
              />
              <Layer
                id="catch-labels"
                type="symbol"
                filter={['!', ['has', 'point_count']]}
                minzoom={12}
                layout={{ 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top',
                  'text-font': ['Noto Sans Regular'] }}
                paint={{ 'text-color': colors.text, 'text-halo-color': colors.surface, 'text-halo-width': 1.5 }}
              />
            </GeoJSONSource>
            <GeoJSONSource
              id="spots"
              data={spotGeo}>
              <Layer id="spot-points" type="circle"
                paint={{ 'circle-color': colors.onGold, 'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': colors.surface }} />
              <Layer id="spot-labels" type="symbol" minzoom={10}
                layout={{ 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top',
                  'text-font': ['Noto Sans Bold'] }}
                paint={{ 'text-color': colors.onGold, 'text-halo-color': colors.surface, 'text-halo-width': 1.5 }} />
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
              <View style={styles.filterPanel}>
                <View style={{ flex: 1 }}>
                  <Segmented options={RANGES} value={range} onChange={pickRange} />
                </View>
                <Dropdown
                  accessibilityLabel="Show catches of"
                  options={[
                    { value: null, label: 'All fish', detail: String(catches.length) },
                    ...speciesChips.map((o) => ({ value: o.id as string | null, label: o.name, detail: String(o.n) })),
                  ]}
                  value={species}
                  onChange={setSpecies}
                  buttonStyle={{ maxWidth: 150 }}
                />
              </View>
              {!tipVisible && <Text style={styles.hint} pointerEvents="none">Long-press to save a spot</Text>}
            </View>

            <View style={styles.actions} pointerEvents="box-none">
              {tipVisible && (
                <Tip
                  style={styles.tip}
                  text="Before a trip, save the area you’ll fish so the map works without signal."
                  onDismiss={dismissTip}
                />
              )}
              <View style={styles.actionRow} pointerEvents="box-none">
                <Pressable style={[styles.fab, styles.fabWide]} onPress={startSelecting} disabled={downloading !== null}
                  accessibilityRole="button" accessibilityLabel="Save an area for offline use">
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
                <View style={{ flex: 1 }} />
                <View style={{ gap: space.md }}>
                  <Pressable style={styles.fab} onPress={() => setLayersOpen(true)} accessibilityRole="button"
                    accessibilityLabel={`Map layers, ${satellite ? 'satellite' : 'map'} view`}>
                    <Layers size={22} color={colors.text} />
                  </Pressable>
                  <Pressable style={styles.fab} onPress={recenter} accessibilityRole="button" accessibilityLabel="Go to my location">
                    <LocateFixed size={22} color={colors.text} />
                  </Pressable>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      <Sheet visible={layersOpen} title="Map" onClose={() => setLayersOpen(false)}>
        {(close) => (
          <>
            <Segmented
              options={[
                { value: 'map', label: 'Map' },
                { value: 'satellite', label: 'Satellite' },
              ]}
              value={satellite ? 'satellite' : 'map'}
              onChange={(v) => setSatellite(v === 'satellite')}
            />
            <Group>
              <Row label="Saved areas" sub="Use the map without signal" onPress={() => close(() => router.push('/offline-areas'))} />
              <Row label="Save an area" sub="Pick part of the map to keep" onPress={() => close(startSelecting)} />
            </Group>
            <Text style={type.caption}>
              {satellite
                ? 'Satellite: EOxCloudless 2025 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025)'
                : 'Map: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors'}
            </Text>
          </>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { position: 'absolute', top: space.sm, left: space.lg, right: space.lg, gap: space.sm, alignItems: 'flex-start' },
  filterPanel: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: space.xs, ...floating,
  },
  // Bottom controls sit clear of the map attribution (logo bottom-left, ⓘ bottom-right).
  actions: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.xl + space.lg, gap: space.md },
  actionRow: { flexDirection: 'row', alignItems: 'flex-end' },
  tip: { ...floating },
  hint: {
    ...type.caption, color: colors.text, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: space.sm,
    paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden',
  },
  fab: {
    minWidth: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    ...floating,
  },
  fabWide: { width: undefined, flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.primary,
    borderRadius: radius.pill },
  fabText: { ...type.headline, color: colors.onPrimary },
  mask: { backgroundColor: 'rgba(0,0,0,0.35)' },
  frame: { borderWidth: 2, borderColor: colors.surface, borderRadius: 4 },
  selectBar: {
    position: 'absolute', left: space.lg, right: space.lg, bottom: space.xl + space.lg, gap: space.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, ...floating,
  },
  selectText: { ...type.secondary, color: colors.text, textAlign: 'center' },
});
