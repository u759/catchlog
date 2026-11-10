import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fish } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Badge, Button, EmptyState, Group, Row, Section } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { parseTs } from '@/features/catches/model';
import { useLocalPhotoUri } from '@/lib/sync/photos';
import { environmentLabel, migrationLabel } from '@/features/collection/fishbaseLabels';
import { useSpecies, useSpeciesLakes } from '@/features/collection/hooks';
import { useUnits } from '@/features/profile/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, space, type } from '@/theme';
import { depthUnit, formatDepth, formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A field-note row: caption label above a body value (for longer text). */
function Note({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.note}>
      <Text style={type.caption}>{label}</Text>
      <Text style={type.body}>{value}</Text>
    </View>
  );
}

export default function SpeciesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSpecies(id);
  const units = useUnits();
  const userId = useUserId() ?? '';
  const lakes = useSpeciesLakes(id);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  const { data: mine } = useLiveQuery<{ id: string; caught_at: string; length_mm: number | null; weight_g: number | null;
    photo_path: string | null; waterbody: string | null }>(
    `SELECT id, caught_at, length_mm, weight_g, photo_path, waterbody FROM catches
     WHERE user_id = ? AND species_id = ? AND deleted_at IS NULL ORDER BY julianday(caught_at) DESC`,
    [userId, id ?? ''],
    ['catches'],
  );

  // Your newest catch of this species that has a photo leads the page.
  const bestPhoto = useLocalPhotoUri(mine.find((c) => c.photo_path)?.photo_path);

  useEffect(() => {
    Location.getLastKnownPositionAsync().then((p) => p && setHere({ lat: p.coords.latitude, lng: p.coords.longitude })).catch(() => {});
  }, []);

  const nearbyLakes = useMemo(() => {
    const d = (l: { lat: number; lng: number }) =>
      here ? (l.lat - here.lat) ** 2 + ((l.lng - here.lng) * Math.cos((here.lat * Math.PI) / 180)) ** 2 : -l.lat;
    return [...lakes].sort((a, b) => (here ? d(a) - d(b) : b.observations - a.observations)).slice(0, 8);
  }, [lakes, here]);

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader back />
        <EmptyState icon={Fish} title="Species not found" body="It isn't in the collection on this phone yet." />
      </View>
    );
  }

  const found = mine.length > 0;
  const pbLength = Math.max(0, ...mine.map((c) => c.length_mm ?? 0));
  const pbWeight = Math.max(0, ...mine.map((c) => c.weight_g ?? 0));
  const heroImage = bestPhoto ?? (s.image_url as string | null);
  const spawning = (() => {
    try {
      return (JSON.parse(String(s.spawning_months ?? '[]')) as number[]).map((m) => MONTHS[m - 1]).join(', ');
    } catch {
      return '';
    }
  })();
  const depth =
    s.depth_min_m != null || s.depth_max_m != null
      ? `${formatDepth((s.depth_min_m as number | null) ?? 0, units)}–${s.depth_max_m != null ? formatDepth(s.depth_max_m as number, units) : '?'} ${depthUnit(units)}`
      : null;
  const temp = s.temp_pref_min_c != null ? `${Math.round(Number(s.temp_pref_min_c))}–${Math.round(Number(s.temp_pref_max_c))} °C` : null;

  const notes: [string, unknown][] = [
    ['Habitat', s.habitat],
    ['Where in the water', environmentLabel(s.environment)],
    ['Migration', migrationLabel(s.migration)],
    ['Depth', depth],
    ['Water temperature', temp],
    ['Spawning months', spawning || null],
    ['Feeding', s.feeding],
    ['Diet', s.diet],
    ['How to tell it apart', s.id_features],
    ['Largest recorded', [
      s.max_length_mm ? `${formatLength(Number(s.max_length_mm), units)} ${lengthUnit(units)}` : null,
      s.max_weight_g ? `${formatWeight(Number(s.max_weight_g), units)} ${weightUnit(units)}` : null,
    ].filter(Boolean).join(', ') || null],
    ['Lifespan', s.longevity_years ? `Up to ${s.longevity_years} years` : null],
    ['In Canada', [s.canada_status, s.canada_notes].filter(Boolean).join(': ') || null],
    ['Conservation status (IUCN)', s.iucn_status],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader back />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={{ gap: space.xs }}>
          <View style={styles.hero}>
            {heroImage ? (
              <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk"
                placeholder={s.image_thumb_url ? { uri: s.image_thumb_url as string } : undefined} placeholderContentFit="cover"
                accessibilityLabel={`Photo of ${String(s.common_name)}`} />
            ) : (
              <Fish size={56} color={colors.textMuted} />
            )}
          </View>
          {!bestPhoto && s.image_author ? (
            <Pressable onPress={() => s.image_page_url && WebBrowser.openBrowserAsync(String(s.image_page_url))} accessibilityRole="link">
              <Text style={type.caption} numberOfLines={1}>
                Photo: {String(s.image_author)} · {String(s.image_license ?? '')} · Wikimedia Commons
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={type.caption}>No. {String(s.dex_no).padStart(3, '0')}</Text>
          <Text style={type.title}>{String(s.common_name)}</Text>
          <Text style={type.secondary}>
            <Text style={{ fontStyle: 'italic' }}>{String(s.scientific_name)}</Text>
            {s.common_name_fr ? `  ·  ${String(s.common_name_fr)}` : ''}
            {s.family_common ? `  ·  ${String(s.family_common)}` : ''}
          </Text>
        </View>

        {found ? (
          <Section title="Your catches">
            <View style={styles.pbRow}>
              <Badge label={`Caught ${mine.length}×`} style={{ alignSelf: 'center' }} />
              <Text style={[type.secondary, { flex: 1 }]}>
                {[
                  pbLength ? `Longest ${formatLength(pbLength, units)} ${lengthUnit(units)}` : null,
                  pbWeight ? `heaviest ${formatWeight(pbWeight, units)} ${weightUnit(units)}` : null,
                ].filter(Boolean).join(', ')}
              </Text>
            </View>
            <Group>
              {mine.slice(0, 10).map((c) => (
                <Row
                  key={c.id}
                  label={parseTs(c.caught_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  sub={c.waterbody}
                  value={c.length_mm != null ? `${formatLength(c.length_mm, units)} ${lengthUnit(units)}` : null}
                  onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}
                />
              ))}
            </Group>
          </Section>
        ) : (
          <Text style={type.secondary}>
            Not caught yet.{lakes.length ? ` Recorded in ${lakes.length} lake${lakes.length > 1 ? 's' : ''}.` : ''}
          </Text>
        )}

        {s.summary ? (
          <Section title="About">
            <Text style={type.body}>{String(s.summary)}</Text>
            {s.summary_url ? (
              <Button label="Read more on Wikipedia" variant="text" onPress={() => WebBrowser.openBrowserAsync(String(s.summary_url))}
                style={styles.textButton} />
            ) : null}
          </Section>
        ) : null}

        {nearbyLakes.length > 0 && (
          <Section title={here ? 'Lakes near you' : 'Where it’s been recorded'}>
            <Group>
              {nearbyLakes.map((l) => (
                <Row
                  key={l.id}
                  label={l.name ?? 'Unnamed lake'}
                  sub={l.mine > 0 ? `You've caught it here · ${l.region}` : l.region}
                  onPress={() => router.push({ pathname: '/lake/[id]', params: { id: l.id } })}
                />
              ))}
            </Group>
            <Text style={type.caption}>Known BC Fish Observations · Open Government Licence – BC</Text>
          </Section>
        )}

        {notes.some(([, v]) => v) && (
          <Section title="Field notes">
            <Group>
              {notes.filter(([, v]) => v).map(([k, v]) => <Note key={k} label={k} value={String(v)} />)}
            </Group>
            <Text style={type.caption}>FishBase · CC BY-NC 4.0</Text>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl * 2 },
  hero: {
    aspectRatio: 16 / 10, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center',
  },
  pbRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  note: { paddingVertical: space.md, gap: 2 },
  textButton: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
