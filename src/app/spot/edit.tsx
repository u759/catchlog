import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/AppHeader';
import { Button, Field, Group, Row } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { deleteSpot, distanceBearing, saveSpot, type Spot, useSpot } from '@/features/spots/hooks';
import { useUnits } from '@/features/profile/hooks';
import { detectWaterbody, type Waterbody } from '@/features/waterbodies/hooks';
import { colors, space, type } from '@/theme';
import { depthUnit, formatDepth, formatDistance, parseDepth } from '@/utils/units';

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
  const units = useUnits();
  const [name, setName] = useState(existing?.name ?? '');
  const [depth, setDepth] = useState(existing?.depth_m != null ? formatDepth(existing.depth_m, units) : '');
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
        depth_m: parseDepth(depth, units),
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
      <ModalHeader title={existing ? 'Fishing spot' : 'Save a spot'} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Group>
          <Row
            label={lake?.name ?? 'Location'}
            sub={`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
            onPress={lake ? () => router.push({ pathname: '/lake/[id]', params: { id: lake.id } }) : undefined}
          />
          {nav ? (
            <Row
              label="From your last position"
              value={`${formatDistance(nav.distance, units)} · ${Math.round(nav.bearing)}° ${COMPASS[Math.round(nav.bearing / 45) % 8]}`}
            />
          ) : null}
        </Group>
        <Field label="Name" placeholder="e.g. Weed bed drop-off" value={name} onChangeText={setName} />
        <Field label="Depth" placeholder="6" value={depth} onChangeText={setDepth} keyboardType="decimal-pad" suffix={depthUnit(units)} />
        <Field label="Notes" placeholder="Structure, what worked, when…" value={notes} onChangeText={setNotes} multiline
          style={{ ...type.body, minHeight: 88, textAlignVertical: 'top', paddingVertical: space.md }} />
        {existing && <Button label="Delete spot" icon={Trash2} variant="danger" onPress={onDelete} style={{ alignSelf: 'flex-start' }} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label={existing ? 'Save changes' : 'Save spot'} onPress={onSave} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
