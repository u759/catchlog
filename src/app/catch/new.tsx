import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Camera, Fish, ImagePlus, MapPin, Save, Sun, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CatchPhoto } from '@/components/CatchPhoto';
import { Button, Chip, EmptyState, Field, InfoPill } from '@/components/ui';
import type { Catch, CatchDraft } from '@/features/catches/api';
import { useCatch, useSaveCatch, useSpecies, useUserId } from '@/features/catches/hooks';
import { storeCatchPhoto } from '@/features/catches/photos';
import { useUnits } from '@/features/profile/hooks';
import {
  fetchCurrentWeather,
  formatTemp,
  formatWind,
  isWeather,
  type Weather,
  weatherLabel,
} from '@/features/weather/openMeteo';
import type { Json } from '@/lib/database.types';
import { colors, radius, space, type } from '@/theme';
import {
  estimateWeightG,
  formatLength,
  formatWeight,
  lengthUnit,
  parseLength,
  parseWeight,
  weightUnit,
} from '@/utils/units';

type Picked = { uri: string; width: number; height: number };
type Visibility = 'private' | 'friends' | 'public';

/** /catch/new = log a catch; /catch/new?id=… = edit that catch. */
export default function CatchFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: existing, isLoading } = useCatch(id);
  if (id && !existing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <EmptyState icon={Fish} title="Catch not found" body="It may have been deleted." />
        )}
      </View>
    );
  }
  return <CatchForm existing={id ? existing : undefined} />;
}

function CatchForm({ existing }: { existing?: Catch | null }) {
  const isEdit = !!existing;
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const units = useUnits();
  const { data: species = [] } = useSpecies();
  const save = useSaveCatch();

  // Initial values come from the catch being edited (if any), read once at mount.
  const [catchId] = useState(() => existing?.id ?? Crypto.randomUUID());
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [speciesText, setSpeciesText] = useState(existing?.species?.common_name ?? existing?.species_other ?? '');
  const [speciesId, setSpeciesId] = useState<string | null>(existing?.species_id ?? null);
  const [length, setLength] = useState(existing?.length_mm ? formatLength(existing.length_mm, units) : '');
  const [weight, setWeight] = useState(
    existing?.weight_g && !existing.weight_estimated ? formatWeight(existing.weight_g, units) : '',
  );
  const [caughtAt, setCaughtAt] = useState(() => (existing ? new Date(existing.caught_at) : new Date()));
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    existing?.lat != null && existing.lng != null ? { lat: existing.lat, lng: existing.lng } : null,
  );
  const [placeName, setPlaceName] = useState<string | null>(existing?.place_name ?? null);
  const [locating, setLocating] = useState(!isEdit);
  const [waterbody, setWaterbody] = useState(existing?.waterbody ?? '');
  const [weather, setWeather] = useState<Weather | null>(isWeather(existing?.weather) ? existing.weather : null);
  const [lure, setLure] = useState(existing?.lure ?? '');
  const [line, setLine] = useState(existing?.line_lb != null ? String(existing.line_lb) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [released, setReleased] = useState(existing?.released ?? true);
  const [visibility, setVisibility] = useState<Visibility>((existing?.visibility as Visibility) ?? 'friends');
  const [saving, setSaving] = useState(false);

  // New catch: grab GPS (works offline), then best-effort place name + weather (need signal).
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos =
          (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (cancelled) return;
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
        if (!cancelled && place) setPlaceName([place.city ?? place.subregion, place.region].filter(Boolean).join(', '));
        const w = await fetchCurrentWeather(lat, lng);
        if (!cancelled && w) setWeather(w);
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  const selectedSpecies = species.find((s) => s.id === speciesId);
  const suggestions = useMemo(() => {
    const q = speciesText.trim().toLowerCase();
    if (selectedSpecies && selectedSpecies.common_name === speciesText) return [];
    return species.filter((s) => !q || s.common_name.toLowerCase().includes(q)).slice(0, 8);
  }, [species, speciesText, selectedSpecies]);

  const lengthMm = parseLength(length, units);
  const estimateG = estimateWeightG(lengthMm, selectedSpecies);

  async function pickPhoto(source: 'camera' | 'library') {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera access is off', 'Enable it in Settings to take catch photos.');
    }
    const res =
      source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.assets?.[0];
    if (!res.canceled && a) setPhoto({ uri: a.uri, width: a.width, height: a.height });
  }

  function openAndroidDateTime() {
    DateTimePickerAndroid.open({
      value: caughtAt,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) setCaughtAt(time);
          },
        });
      },
    });
  }

  async function onSave() {
    if (!userId) return;
    if (!speciesText.trim()) return Alert.alert('Which fish?', 'Pick or type a species.');
    setSaving(true);
    try {
      const localPhotoUri = photo ? await storeCatchPhoto(photo.uri, catchId, photo.width, photo.height) : null;
      const typedWeightG = parseWeight(weight, units);
      const row: CatchDraft = {
        id: catchId,
        user_id: userId,
        species_id: speciesId,
        species_other: speciesId ? null : speciesText.trim(),
        length_mm: lengthMm,
        weight_g: typedWeightG ?? estimateG,
        weight_estimated: typedWeightG == null && estimateG != null,
        caught_at: caughtAt.toISOString(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        place_name: placeName,
        waterbody: waterbody.trim() || null,
        weather: (weather as unknown as Json) ?? null,
        lure: lure.trim() || null,
        line_lb: line ? Number.parseFloat(line) || null : null,
        notes: notes.trim() || null,
        released,
        visibility,
      };
      // Fire-and-forget: if offline, this pauses in the persisted queue and syncs later.
      save.mutate({ row, localPhotoUri, speciesName: selectedSpecies?.common_name ?? row.species_other ?? null });
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + space.sm : space.lg }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <X size={24} color={colors.text} />
        </Pressable>
        <Text style={[type.heading, { flex: 1, textAlign: 'center' }]}>{isEdit ? 'Edit Catch' : 'Log Catch'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <View style={styles.photoBox}>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : isEdit && existing?.photo_path ? (
            <CatchPhoto catchId={catchId} photoPath={existing.photo_path} photoUrl={existing.photo_url} style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={styles.photoActions}>
            <Button label={photo || existing?.photo_path ? 'Retake' : 'Take photo'} icon={Camera} variant="accent" onPress={() => pickPhoto('camera')} style={{ height: 44 }} />
            <Button label="Library" icon={ImagePlus} variant="secondary" onPress={() => pickPhoto('library')} style={{ height: 44 }} />
          </View>
        </View>

        {/* Species */}
        <View style={{ gap: space.sm }}>
          <Field
            label="Species"
            placeholder="e.g. Largemouth Bass"
            value={speciesText}
            onChangeText={(t) => {
              setSpeciesText(t);
              const exact = species.find((s) => s.common_name.toLowerCase() === t.trim().toLowerCase());
              setSpeciesId(exact?.id ?? null);
            }}
          />
          {suggestions.length > 0 && (
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Chip
                  key={s.id}
                  label={s.common_name}
                  selected={s.id === speciesId}
                  onPress={() => {
                    setSpeciesId(s.id);
                    setSpeciesText(s.common_name);
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* Measurements */}
        <View style={styles.row}>
          <Field label="Length" keyboardType="decimal-pad" value={length} onChangeText={setLength} suffix={lengthUnit(units)} placeholder="0.0" />
          <Field
            label="Weight"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            suffix={weightUnit(units)}
            placeholder={estimateG ? `≈ ${formatWeight(estimateG, units)}` : '0.0'}
          />
        </View>
        {estimateG != null && !weight && (
          <Text style={type.muted}>
            No scale? We’ll save ≈{formatWeight(estimateG, units)} {weightUnit(units)}, estimated from length for this species.
          </Text>
        )}

        {/* When */}
        <View style={{ gap: space.xs }}>
          <Text style={type.label}>WHEN</Text>
          {Platform.OS === 'ios' ? (
            <View style={styles.inlineCard}>
              <Calendar size={18} color={colors.primary} />
              <DateTimePicker
                value={caughtAt}
                mode="datetime"
                display="compact"
                maximumDate={new Date()}
                accentColor={colors.primary}
                onChange={(_, d) => d && setCaughtAt(d)}
              />
            </View>
          ) : (
            <Pressable style={styles.inlineCard} onPress={openAndroidDateTime}>
              <Calendar size={18} color={colors.primary} />
              <Text style={type.body}>
                {caughtAt.toLocaleDateString()} · {caughtAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Where + conditions */}
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>WHERE</Text>
          <InfoPill
            icon={MapPin}
            value={locating ? 'Finding your location…' : (placeName ?? (coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Location unavailable'))}
          />
          <Field label="Waterbody / spot" placeholder="e.g. Lake Travis, Sandy Point" value={waterbody} onChangeText={setWaterbody} />
          {weather && (
            <InfoPill
              icon={Sun}
              label="Conditions (auto)"
              value={`${formatTemp(weather.temp_c, units)}, ${weatherLabel(weather.weather_code)} · Wind ${formatWind(weather.wind_kph, weather.wind_dir_deg, units)}`}
            />
          )}
        </View>

        {/* Tackle */}
        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Field label="Lure / bait" placeholder="Yellow crankbait" value={lure} onChangeText={setLure} />
          </View>
          <Field label="Line" keyboardType="decimal-pad" placeholder="12" value={line} onChangeText={setLine} suffix="lb" />
        </View>

        <Field label="Notes" placeholder="How'd it go down?" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 88, fontSize: 16, color: colors.text, textAlignVertical: 'top', paddingVertical: space.md }} />

        {/* Options */}
        <View style={styles.inlineCard}>
          <Text style={[type.body, { flex: 1 }]}>Released</Text>
          <Switch value={released} onValueChange={setReleased} trackColor={{ true: colors.primary }} />
        </View>
        <View style={{ gap: space.xs }}>
          <Text style={type.label}>WHO CAN SEE THIS</Text>
          <View style={styles.chips}>
            {(['private', 'friends', 'public'] as const).map((v) => (
              <Chip key={v} label={v[0].toUpperCase() + v.slice(1)} selected={visibility === v} onPress={() => setVisibility(v)} />
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label={isEdit ? 'Save Changes' : 'Save Catch'} icon={Save} onPress={onSave} loading={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  photoBox: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  photoActions: { flexDirection: 'row', gap: space.sm, padding: space.md, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  inlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
