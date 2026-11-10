import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Compass, MapPin, Save, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, InfoPill } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { deleteSpot, distanceBearing, saveSpot, type Spot, useSpot } from '@/features/spots/hooks';
import { detectWaterbody, type Waterbody } from '@/features/waterbodies/hooks';
import { colors, space, type } from '@/theme';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** /spot/edit?lat=&lng= = new spot at a point; /spot/edit?id=… = view/edit a saved spot. */
export default function SpotEditScreen() {
  const { id, lat, lng } = useLocalSearchParams<{ id?: string; lat?: string; lng?: string }>();
  const existing = useSpot(id);
  if (id && !existing) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const point = existing ? { lat: existing.lat, lng: existing.lng } : { lat: Number(lat), lng: Number(lng) };
  return <SpotForm existing={existing} point={point} />;
}

function SpotForm({ existing, point }: { existing: Spot | null; point: { lat: number; lng: number } }) {
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const [name, setName] = useState(existing?.name ?? '');
  const [depth, setDepth] = useState(existing?.depth_m != null ? String(existing.depth_m) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [lake, setLake] = useState<Waterbody | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    detectWaterbody(point.lat, point.lng).then(setLake).catch(() => {});
    Location.getLastKnownPositionAsync()
      .then((p) => p && setHere({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch(() => {});
  }, [point.lat, point.lng]);

  const nav = here ? distanceBearing(here, point) : null;

  const onSave = async () => {
    if (!userId) return;
    await saveSpot(
      userId,
      {
        name: name.trim() || (lake?.name ? `${lake.name} spot` : 'Fishing spot'),
        lat: point.lat,
        lng: point.lng,
        depth_m: depth ? Number.parseFloat(depth) || null : null,
        notes: notes.trim() || null,
        waterbody_id: lake?.id ?? null,
      },
      existing?.id,
    );
    router.back();
  };

  const onDelete = () =>
    Alert.alert('Delete this spot?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSpot(existing!.id); router.back(); } },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + space.sm : space.lg }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <X size={24} color={colors.text} />
        </Pressable>
        <Text style={[type.heading, { flex: 1, textAlign: 'center' }]}>{existing ? 'Spot' : 'Save Spot'}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <InfoPill icon={MapPin} label={lake?.name ?? 'Location'} value={`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`} />
        {nav && (
          <InfoPill
            icon={Compass}
            label="From your last position"
            value={`${nav.distance < 1000 ? `${Math.round(nav.distance)} m` : `${(nav.distance / 1000).toFixed(1)} km`} · ${Math.round(nav.bearing)}° ${COMPASS[Math.round(nav.bearing / 45) % 8]}`}
          />
        )}
        {lake && (
          <Pressable onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}>
            <Text style={styles.link}>View {lake.name ?? 'lake'} details →</Text>
          </Pressable>
        )}
        <Field label="Name" placeholder="e.g. Weed bed drop-off" value={name} onChangeText={setName} />
        <Field label="Depth" placeholder="6" value={depth} onChangeText={setDepth} keyboardType="decimal-pad" suffix="m" />
        <Field label="Notes" placeholder="Structure, what worked, when…" value={notes} onChangeText={setNotes} multiline
          style={{ minHeight: 88, fontSize: 16, color: colors.text, textAlignVertical: 'top', paddingVertical: space.md }} />
        {existing && <Button label="Delete spot" icon={Trash2} variant="ghost" onPress={onDelete} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label="Save" icon={Save} onPress={onSave} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.md },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  link: { color: colors.primary, fontWeight: '600' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
