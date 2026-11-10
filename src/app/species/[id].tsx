import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, Fish, MapPin, Ruler, Scale, Sparkles, Trophy } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Card, EmptyState, Section, StatTile } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { parseTs } from '@/features/catches/model';
import { localPhotoUri } from '@/features/catches/photos';
import { useSpecies, useSpeciesLakes } from '@/features/collection/hooks';
import { useUnits } from '@/features/profile/hooks';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, space, type } from '@/theme';
import { depthUnit, formatDepth, formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const firstSentence = (s: unknown) => (typeof s === 'string' ? (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim() : null);

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
     WHERE user_id = ? AND species_id = ? ORDER BY julianday(caught_at) DESC`,
    [userId, id ?? ''],
    ['catches'],
  );

  useEffect(() => {
    Location.getLastKnownPositionAsync().then((p) => p && setHere({ lat: p.coords.latitude, lng: p.coords.longitude })).catch(() => {});
  }, []);

  const nearbyLakes = useMemo(() => {
    const d = (l: { lat: number; lng: number }) =>
      here ? (l.lat - here.lat) ** 2 + ((l.lng - here.lng) * Math.cos((here.lat * Math.PI) / 180)) ** 2 : -l.lat;
    return [...lakes].sort((a, b) => (here ? d(a) - d(b) : b.observations - a.observations)).slice(0, 12);
  }, [lakes, here]);

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader title="Species" back />
        <EmptyState icon={Fish} title="Not found" body="This species isn't in the collection." />
      </View>
    );
  }

  const found = mine.length > 0;
  const pbLength = Math.max(...mine.map((c) => c.length_mm ?? 0));
  const pbWeight = Math.max(...mine.map((c) => c.weight_g ?? 0));
  const bestPhoto = mine.map((c) => localPhotoUri(c.photo_path)).find(Boolean);
  const heroImage = bestPhoto ?? (s.image_url as string | null);
  const spawning = (() => {
    try {
      return (JSON.parse(String(s.spawning_months ?? '[]')) as number[]).map((m) => MONTHS[m - 1]).join(', ');
    } catch {
      return '';
    }
  })();
  const depth = s.depth_min_m != null || s.depth_max_m != null ? `${formatDepth((s.depth_min_m as number | null) ?? 0, units)}–${s.depth_max_m != null ? formatDepth(s.depth_max_m as number, units) : '?'} ${depthUnit(units)}` : null;
  const temp = s.temp_pref_min_c != null ? `${Math.round(Number(s.temp_pref_min_c))}–${Math.round(Number(s.temp_pref_max_c))} °C` : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={`#${String(s.dex_no).padStart(3, '0')}`} back />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          {heroImage ? (
            <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk"
              placeholder={s.image_thumb_url ? { uri: s.image_thumb_url as string } : undefined} placeholderContentFit="cover" />
          ) : (
            <Fish size={56} color={colors.textMuted} />
          )}
        </View>
        {!bestPhoto && s.image_author ? (
          <Pressable onPress={() => s.image_page_url && WebBrowser.openBrowserAsync(String(s.image_page_url))}>
            <Text style={styles.credit} numberOfLines={1}>
              Photo: {String(s.image_author)} · {String(s.image_license ?? '')} · Wikimedia Commons
            </Text>
          </Pressable>
        ) : null}

        <View style={{ gap: 2 }}>
          <Text style={type.title}>{String(s.common_name)}</Text>
          <Text style={type.muted}>
            <Text style={{ fontStyle: 'italic' }}>{String(s.scientific_name)}</Text>
            {s.common_name_fr ? ` · ${String(s.common_name_fr)}` : ''}{s.family_common ? ` · ${String(s.family_common)}` : ''}
          </Text>
        </View>

        {found ? (
          <>
            <View style={styles.stats}>
              <StatTile label="Caught" value={String(mine.length)} unit="×" />
              <StatTile label="Best length" value={pbLength ? formatLength(pbLength, units) : '—'} unit={pbLength ? lengthUnit(units) : undefined} />
              <StatTile label="Best weight" value={pbWeight ? formatWeight(pbWeight, units) : '—'} unit={pbWeight ? weightUnit(units) : undefined} />
            </View>
            <Section title="Your catches" icon={Trophy}>
              {mine.slice(0, 10).map((c) => (
                <Pressable key={c.id} style={styles.row} onPress={() => router.push({ pathname: '/catch/[id]', params: { id: c.id } })}>
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                    {parseTs(c.caught_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    {c.waterbody ? ` · ${c.waterbody}` : ''}
                  </Text>
                  <Text style={type.muted}>
                    {formatLength(c.length_mm, units)} {lengthUnit(units)}
                  </Text>
                </Pressable>
              ))}
            </Section>
          </>
        ) : (
          <Card style={{ gap: space.sm, backgroundColor: colors.accent }}>
            <View style={styles.inline}>
              <Sparkles size={18} color={colors.onAccent} />
              <Text style={[type.heading, { color: colors.onAccent }]}>Not caught yet</Text>
            </View>
            {[
              firstSentence(s.habitat),
              depth ? `Usually found at ${depth}.` : null,
              spawning ? `Spawns: ${spawning}.` : null,
              lakes.length ? `Recorded in ${lakes.length} lake${lakes.length > 1 ? 's' : ''}${nearbyLakes[0]?.name ? `, e.g. ${nearbyLakes[0].name}` : ''}.` : null,
            ]
              .filter(Boolean)
              .map((h) => (
                <Text key={h!} style={[type.body, { color: colors.onAccent }]}>
                  • {h}
                </Text>
              ))}
          </Card>
        )}

        {s.summary ? (
          <Section title="About" icon={BookOpen}>
            <Text style={[type.body, { lineHeight: 22 }]}>{String(s.summary)}</Text>
            {s.summary_url ? (
              <Pressable onPress={() => WebBrowser.openBrowserAsync(String(s.summary_url))}>
                <Text style={styles.link}>Wikipedia (CC BY-SA 4.0)</Text>
              </Pressable>
            ) : null}
          </Section>
        ) : null}

        <Section title="Field notes" icon={Ruler}>
          {[
            ['Habitat', s.habitat],
            ['Environment', s.environment],
            ['Migration', s.migration],
            ['Depth', depth],
            ['Preferred water', temp],
            ['Spawning', spawning || null],
            ['Feeding', s.feeding],
            ['Diet', s.diet],
            ['How to tell it apart', s.id_features],
            ['Max weight', s.max_weight_g ? `${formatWeight(Number(s.max_weight_g), units)} ${weightUnit(units)}` : null],
            ['Max length', s.max_length_mm ? `${formatLength(Number(s.max_length_mm), units)} ${lengthUnit(units)}` : null],
            ['Lifespan', s.longevity_years ? `${s.longevity_years} years` : null],
            ['In Canada', [s.canada_status, s.canada_notes].filter(Boolean).join(' — ') || null],
            ['Conservation (IUCN)', s.iucn_status],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <View key={String(k)} style={{ gap: 2 }}>
                <Text style={type.label}>{String(k).toUpperCase()}</Text>
                <Text style={type.body}>{String(v)}</Text>
              </View>
            ))}
          <Text style={type.muted}>Data: FishBase (CC BY-NC 4.0)</Text>
        </Section>

        {nearbyLakes.length > 0 && (
          <Section title={here ? 'Lakes near you' : 'Where it’s been recorded'} icon={MapPin}>
            {nearbyLakes.map((l) => (
              <Pressable key={l.id} style={styles.row} onPress={() => router.push({ pathname: '/lake/[id]', params: { id: l.id } })}>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {l.name ?? 'Unnamed lake'}
                </Text>
                {l.mine > 0 && <Scale size={14} color={colors.primary} />}
                <Text style={type.muted}>{l.region}</Text>
              </Pressable>
            ))}
            <Text style={type.muted}>Known BC Fish Observations (Open Government Licence – BC)</Text>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  hero: {
    height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center',
  },
  credit: { fontSize: 11, color: colors.textMuted, marginTop: -space.md },
  stats: { flexDirection: 'row', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { color: colors.primary, fontWeight: '600', marginTop: space.xs },
});
