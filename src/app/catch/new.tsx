import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Camera, Fish, ImagePlus, ScanSearch } from 'lucide-react-native';
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

import { ModalHeader } from '@/components/AppHeader';
import { CatchPhoto } from '@/components/CatchPhoto';
import { Button, Chip, EmptyState, Field, Group, Row, Segmented } from '@/components/ui';
import {
  type FormPhoto,
  MAX_PHOTOS,
  saveCatch,
  useCatch,
  useCatchPhotos,
  usePendingUploads,
  useUserId,
} from '@/features/catches/hooks';
import { identifyFish, type IdResult } from '@/features/catches/identify';
import { type CatchPhotoRef, type CatchView, parseTs } from '@/features/catches/model';
import { pickCatchPhotos } from '@/features/catches/photos';
import { useLocalPhotoUri } from '@/lib/sync/photos';
import { regionCodes, searchSpecies, useSpeciesIndex } from '@/features/catches/speciesSearch';
import { useGearList } from '@/features/gear/hooks';
import { isLure } from '@/features/gear/taxonomy';
import {
  detectWaterbody,
  speciesInWaterbody,
  useWaterbody,
  type Waterbody,
  waterbodyAtOnline,
} from '@/features/waterbodies/hooks';
import { useUnits } from '@/features/profile/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import {
  fetchCurrentWeather,
  formatTemp,
  formatWind,
  isWeather,
  type Weather,
  weatherLabel,
} from '@/features/weather/openMeteo';
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

type Visibility = 'private' | 'friends' | 'public';
/** An ID result and the photo it was for (a new cover photo hides the old result). */
type ShownId = IdResult & { photoId: string };
const percent = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Weather to save with a catch. Live weather only describes catches within the last hour; for anything else (or an
 * edit that moved the time/place) save nothing and the sync fills it in for the catch's own time.
 */
function weatherForSave(
  weather: Weather | null,
  caughtAt: Date,
  coords: { lat: number; lng: number } | null,
  existing?: CatchView | null,
) {
  if (existing) {
    const moved = parseTs(existing.caught_at).getTime() !== caughtAt.getTime() || existing.lat !== coords?.lat || existing.lng !== coords?.lng;
    return moved ? null : weather;
  }
  return Math.abs(Date.now() - caughtAt.getTime()) <= 60 * 60_000 ? weather : null;
}

/** /catch/new = log a catch; ?id=… = edit that catch; ?lake=… = log a catch at that lake. */
export default function CatchFormScreen() {
  const { id, lake: lakeId } = useLocalSearchParams<{ id?: string; lake?: string }>();
  const { data: existing, isLoading } = useCatch(id);
  const { photos: existingPhotos, isLoading: photosLoading } = useCatchPhotos(id ? existing : null);
  const presetLake = useWaterbody(id ? undefined : lakeId);
  if ((!id && lakeId && !presetLake) || (id && existing && photosLoading)) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
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
  return (
    <CatchForm
      existing={id ? existing : undefined}
      presetLake={id ? null : presetLake}
      initialPhotos={id ? existingPhotos : []}
    />
  );
}

function CatchForm({
  existing,
  presetLake,
  initialPhotos,
}: {
  existing?: CatchView | null;
  presetLake: Waterbody | null;
  initialPhotos: CatchPhotoRef[];
}) {
  const lakeId = presetLake?.id;
  const isEdit = !!existing;
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const units = useUnits();
  const speciesIndex = useSpeciesIndex();

  // Initial values come from the catch being edited (if any), read once at mount.
  const [photos, setPhotos] = useState<FormPhoto[]>(() => initialPhotos.map((p) => ({ id: p.id, path: p.path })));
  const [adding, setAdding] = useState(false);
  const [idResult, setIdResult] = useState<ShownId | null>(null);
  const [idError, setIdError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const sync = usePendingUploads();
  const [speciesText, setSpeciesText] = useState(existing?.species?.common_name ?? existing?.species_other ?? '');
  const [speciesId, setSpeciesId] = useState<string | null>(existing?.species_id ?? null);
  const [length, setLength] = useState(existing?.length_mm ? formatLength(existing.length_mm, units) : '');
  const [weight, setWeight] = useState(
    existing?.weight_g && !existing.weight_estimated ? formatWeight(existing.weight_g, units) : '',
  );
  const [caughtAt, setCaughtAt] = useState(() => (existing ? parseTs(existing.caught_at) : new Date()));
  // Logging from a lake page: the catch is at that lake (its centre), not wherever the phone is now.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    existing?.lat != null && existing.lng != null
      ? { lat: existing.lat, lng: existing.lng }
      : presetLake
        ? { lat: presetLake.lat, lng: presetLake.lng }
        : null,
  );
  const [placeName, setPlaceName] = useState<string | null>(existing?.place_name ?? null);
  const [locating, setLocating] = useState(!isEdit && !lakeId);
  // Free-text spot ("north bay"). The lake itself is linked by position, not typed.
  const [waterbody, setWaterbody] = useState(existing?.waterbody ?? '');
  const [weather, setWeather] = useState<Weather | null>(isWeather(existing?.weather) ? existing.weather : null);
  const [lure, setLure] = useState(existing?.lure ?? '');
  const [line, setLine] = useState(existing?.line_lb != null ? String(existing.line_lb) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [released, setReleased] = useState(existing?.released ?? true);
  const [visibility, setVisibility] = useState<Visibility>((existing?.visibility as Visibility) ?? 'friends');
  const [saving, setSaving] = useState(false);
  const [regions, setRegions] = useState<string[]>(presetLake?.region ? [presetLake.region] : []); // for species suggestions
  const [gearId, setGearId] = useState<string | null>(existing?.gear_id ?? null);
  const [lake, setLake] = useState<Waterbody | null>(presetLake);
  const [lakeSpecies, setLakeSpecies] = useState<Set<string>>(new Set());
  const { data: gear } = useGearList();
  // Your catch count per species, so your usual fish are suggested first.
  const { data: myCounts } = useLiveQuery<{ species_id: string; n: number }>(
    'SELECT species_id, count(*) AS n FROM catches WHERE user_id = ? AND species_id IS NOT NULL AND deleted_at IS NULL GROUP BY species_id',
    [userId ?? ''],
    ['catches'],
  );
  const mySpecies = useMemo(() => new Map(myCounts.map((r) => [r.species_id, r.n])), [myCounts]);
  const lures = useMemo(() => gear.filter((g) => isLure(g.category)).slice(0, 10), [gear]);

  // Preset lake (from a lake page): load its species and the weather there.
  useEffect(() => {
    if (!presetLake) return;
    let cancelled = false;
    speciesInWaterbody(presetLake.id).then((s) => !cancelled && setLakeSpecies(s)).catch(() => {});
    fetchCurrentWeather(presetLake.lat, presetLake.lng).then((w) => !cancelled && w && setWeather(w)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [presetLake]);

  // Lake at the catch location: an instant offline guess from lake boxes, then (with signal) the server's exact
  // answer from lake outlines. Boosts that lake's species in the suggestions. The server re-checks on upload.
  useEffect(() => {
    if (!coords || lakeId) return;
    let cancelled = false;
    const use = async (w: Waterbody | null) => {
      if (cancelled) return;
      setLake(w);
      setLakeSpecies(w ? await speciesInWaterbody(w.id) : new Set());
      if (w?.region) setRegions((r) => (r.length ? r : [w.region]));
    };
    (async () => {
      await use(await detectWaterbody(coords.lat, coords.lng));
      const exact = await waterbodyAtOnline(coords.lat, coords.lng);
      if (exact !== undefined) await use(exact);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [coords, lakeId]);

  // New catch: grab GPS (works offline), then best-effort place name + weather (need signal).
  useEffect(() => {
    if (isEdit || lakeId) return;
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
        if (!cancelled && place) {
          setPlaceName([place.city ?? place.subregion, place.region].filter(Boolean).join(', '));
          setRegions(regionCodes(place.region, place.isoCountryCode));
        }
        const w = await fetchCurrentWeather(lat, lng);
        if (!cancelled && w) setWeather(w);
      } catch {
        // No GPS fix (indoors, simulator without a location): leave location empty.
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, lakeId]);

  const selectedSpecies = speciesId ? speciesIndex.byId.get(speciesId) : undefined;
  const suggestions = useMemo(() => {
    if (selectedSpecies && selectedSpecies.common_name === speciesText) return [];
    return searchSpecies(speciesIndex, speciesText, regions, 6, lakeSpecies, mySpecies);
  }, [speciesIndex, speciesText, selectedSpecies, regions, lakeSpecies, mySpecies]);

  const lengthMm = parseLength(length, units);
  const estimateG = estimateWeightG(lengthMm, selectedSpecies);
  const overMax =
    lengthMm != null && selectedSpecies?.max_length_mm != null && lengthMm > selectedSpecies.max_length_mm;

  async function pickPhoto(source: 'camera' | 'library') {
    setAdding(true);
    try {
      const r = await pickCatchPhotos(source, MAX_PHOTOS - photos.length);
      if (r === 'denied') return Alert.alert('Camera access is off', 'Turn it on in Settings to take catch photos.');
      if (r === 'no-camera') return Alert.alert('No camera on this device', 'Choose a photo from your library instead.');
      setPhotos((cur) => [...cur, ...r.map((p) => ({ id: Crypto.randomUUID(), uri: p.uri }))].slice(0, MAX_PHOTOS));
    } finally {
      setAdding(false);
    }
  }

  function photoActions(p: FormPhoto, index: number) {
    Alert.alert('Photo', undefined, [
      ...(index > 0
        ? [{ text: 'Make cover photo', onPress: () => setPhotos((cur) => [p, ...cur.filter((x) => x.id !== p.id)]) }]
        : []),
      { text: 'Remove', style: 'destructive' as const, onPress: () => setPhotos((cur) => cur.filter((x) => x.id !== p.id)) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  // Fishial identifies the cover photo (the same compressed JPEG that gets uploaded).
  const cover = photos[0];
  const coverFile = useLocalPhotoUri(cover?.uri ? null : cover?.path);
  const coverUri = cover ? (cover.uri ?? coverFile) : null;
  const shownId = idResult && idResult.photoId === cover?.id ? idResult : null;
  async function identify() {
    if (!coverUri || !cover) return;
    setIdentifying(true);
    setIdError(null);
    try {
      setIdResult({ ...(await identifyFish(coverUri)), photoId: cover.id });
    } catch (e) {
      setIdError(e instanceof Error ? e.message : 'Fish ID is unavailable right now. Try again later.');
    } finally {
      setIdentifying(false);
    }
  }

  function openAndroidDateTime() {
    DateTimePickerAndroid.open({
      value: caughtAt,
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (_, date) => {
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          // The date picker caps the day; a time later today is clamped to now.
          onValueChange: (_e, time) => setCaughtAt(time > new Date() ? new Date() : time),
        });
      },
    });
  }

  async function onSave() {
    if (!userId) return;
    if (!speciesText.trim()) return Alert.alert('Which fish?', 'Pick or type a species.');
    setSaving(true);
    try {
      const typedWeightG = parseWeight(weight, units);
      // Written to local SQLite immediately; the sync engine uploads it (and the photo) when online.
      await saveCatch({
        id: existing?.id,
        userId,
        photos,
        previousPhotos: initialPhotos,
        input: {
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
          // Weather must describe the catch's time. "Now" weather only counts if the catch was within the hour;
          // otherwise (or when an edit moved the time/place) leave it empty and the sync fills it in for caughtAt.
          weather: weatherForSave(weather, caughtAt, coords, existing),
          lure: lure.trim() || null,
          gear_id: gearId,
          waterbody_id: lake?.id ?? null, // offline guess; the server sets the real one
          line_lb: line ? Number.parseFloat(line) || null : null,
          notes: notes.trim() || null,
          released,
          visibility,
        },
      });
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Couldn’t save', 'Your entries are still here. Try again.');
      console.warn('saveCatch failed', e);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ModalHeader title={isEdit ? 'Edit catch' : 'Log a catch'} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Photos: the cover large, the rest as thumbnails. Tap one to make it the cover or remove it. */}
        {cover ? (
          <View style={{ gap: space.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cover photo, options"
              onPress={() => photoActions(cover, 0)}
              style={styles.photoBox}>
              <FormThumb photo={cover} />
            </Pressable>
            {photos.length > 1 && (
              <View style={styles.thumbs}>
                {photos.slice(1).map((p, i) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${i + 2}, options`}
                    onPress={() => photoActions(p, i + 1)}
                    style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.6 }]}>
                    <FormThumb photo={p} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}
        <View style={styles.photoActions}>
          <Button label="Take photo" icon={Camera} variant="secondary" onPress={() => pickPhoto('camera')}
            disabled={photos.length >= MAX_PHOTOS} loading={adding} style={{ flex: 1 }} />
          <Button label="Library" icon={ImagePlus} variant="secondary" onPress={() => pickPhoto('library')}
            disabled={photos.length >= MAX_PHOTOS || adding} style={{ flex: 1 }} />
        </View>
        {photos.length >= MAX_PHOTOS && <Text style={type.secondary}>That’s the most photos for one catch ({MAX_PHOTOS}).</Text>}

        {/* Species */}
        <View style={{ gap: space.sm }}>
          <Field
            label="Species"
            placeholder="Type a fish name"
            value={speciesText}
            onChangeText={(t) => {
              setSpeciesText(t);
              const typed = t.trim().toLowerCase();
              const exact = speciesIndex.list.find((s) =>
                [s.common_name, s.common_name_fr, s.scientific_name].some((n) => n?.toLowerCase() === typed),
              );
              setSpeciesId(exact?.id ?? null);
            }}
          />
          {coverUri && !shownId && (
            <Button
              label={sync.connected ? 'Identify from photo' : 'Identify needs signal'}
              icon={ScanSearch}
              variant="text"
              onPress={identify}
              loading={identifying}
              disabled={!sync.connected}
              style={{ alignSelf: 'flex-start', marginLeft: -space.md }}
            />
          )}
          {idError && !identifying ? <Text style={[type.secondary, { color: colors.danger }]}>{idError}</Text> : null}
          {shownId && (
            <View style={{ gap: space.sm }}>
              {shownId.candidates.length + shownId.unmatched.length > 0 ? (
                <View style={styles.chips}>
                  {shownId.candidates.map((s) => (
                    <Chip
                      key={s.species_id}
                      label={`${s.common_name} · ${percent(s.certainty)}`}
                      selected={s.species_id === speciesId}
                      onPress={() => {
                        setSpeciesId(s.species_id);
                        setSpeciesText(speciesIndex.byId.get(s.species_id)?.common_name ?? s.common_name);
                      }}
                    />
                  ))}
                  {shownId.unmatched.map((s) => (
                    <Chip
                      key={s.name}
                      label={`${s.name} · ${percent(s.certainty)}`}
                      selected={!speciesId && speciesText === s.name}
                      onPress={() => {
                        setSpeciesId(null);
                        setSpeciesText(s.name);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Text style={type.secondary}>
                  {shownId.fish_found ? 'Couldn’t tell which fish this is.' : 'No fish found in this photo.'}
                </Text>
              )}
              <Text style={type.caption}>
                {['Suggested by Fishial.ai', shownId.credits_left != null && `${shownId.credits_left} IDs left this month`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          )}
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
        {overMax && selectedSpecies?.max_length_mm != null && (
          <Text style={[type.secondary, { color: colors.danger }]}>
            That’s longer than the largest {selectedSpecies.common_name} on record (
            {formatLength(selectedSpecies.max_length_mm, units)} {lengthUnit(units)}). Double-check the length.
          </Text>
        )}
        {estimateG != null && !weight && (
          <Text style={type.secondary}>
            No scale? We’ll save ≈{formatWeight(estimateG, units)} {weightUnit(units)}, estimated from the length.
          </Text>
        )}

        {/* When */}
        <View style={{ gap: space.xs }}>
          <Text style={type.caption}>When</Text>
          {Platform.OS === 'ios' ? (
            <View style={styles.inlineCard}>
              <Calendar size={18} color={colors.primary} />
              <DateTimePicker
                value={caughtAt}
                mode="datetime"
                display="compact"
                maximumDate={new Date()}
                accentColor={colors.primary}
                onValueChange={(_, d) => setCaughtAt(d)}
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
          <Field label="Spot (optional)" placeholder="e.g. north bay, by the dock" value={waterbody} onChangeText={setWaterbody} />
          <Group>
            <Row
              label="Lake"
              value={lake ? (lake.name ?? 'Unnamed lake') : locating ? 'Finding…' : coords ? 'None nearby' : 'Needs location'}
            />
            {presetLake ? null : (
              <Row
                label="Location"
                value={
                  locating
                    ? 'Finding…'
                    : (placeName ?? (coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Not available'))
                }
              />
            )}
            {weather ? (
              <Row
                label="Weather"
                value={`${formatTemp(weather.temp_c, units)}, ${weatherLabel(weather.weather_code)} · ${formatWind(weather.wind_kph, weather.wind_dir_deg, units)}`}
              />
            ) : null}
          </Group>
        </View>

        {/* Tackle */}
        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Field
              label="Lure / bait"
              placeholder="Yellow crankbait"
              value={lure}
              onChangeText={(t) => {
                setLure(t);
                if (gearId && gear.find((g) => g.id === gearId)?.name !== t) setGearId(null);
              }}
            />
          </View>
          <Field label="Line" keyboardType="decimal-pad" placeholder="12" value={line} onChangeText={setLine} suffix="lb" />
        </View>

        {lures.length > 0 && (
          <View style={styles.chips}>
            {lures.map((g) => (
              <Chip
                key={g.id}
                label={g.catches ? `${g.name} · ${g.catches}` : g.name}
                selected={gearId === g.id}
                onPress={() => {
                  setGearId(gearId === g.id ? null : g.id);
                  setLure(gearId === g.id ? '' : g.name);
                }}
              />
            ))}
          </View>
        )}

        <Field label="Notes" placeholder="Bait, depth, what worked…" value={notes} onChangeText={setNotes} multiline style={{ ...type.body, minHeight: 88, textAlignVertical: 'top', paddingVertical: space.md }} />

        {/* Options */}
        <Group>
          <Row
            label="Released"
            right={<Switch value={released} onValueChange={setReleased} trackColor={{ true: colors.primary }} accessibilityLabel="Released" />}
          />
        </Group>
        <View style={{ gap: space.xs }}>
          <Text style={type.caption}>Who can see this</Text>
          <Segmented
            options={[
              { value: 'private', label: 'Only me' },
              { value: 'friends', label: 'Friends' },
              { value: 'public', label: 'Everyone' },
            ]}
            value={visibility}
            onChange={setVisibility}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label={isEdit ? 'Save changes' : 'Save catch'} onPress={onSave} loading={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** A form photo: a new one from its compressed temp file, an existing one from the phone (or a signed URL). */
function FormThumb({ photo }: { photo: FormPhoto }) {
  return photo.uri ? (
    <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
  ) : (
    <CatchPhoto photoPath={photo.path} style={StyleSheet.absoluteFill} />
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  photoBox: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  photoActions: { flexDirection: 'row', gap: space.sm },
  thumbs: { flexDirection: 'row', gap: space.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  inlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
