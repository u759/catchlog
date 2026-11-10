import { router, useLocalSearchParams } from 'expo-router';
import { Anchor, ArrowLeft, Clock, Fish, MapPin, Moon, NotebookPen, Pencil, Sun, Sunrise, Trash2, Wind } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CatchPhoto } from '@/components/CatchPhoto';
import { Button, Card, EmptyState, InfoPill, Section, StatTile } from '@/components/ui';
import { astroAt, fmtTime } from '@/features/astro/astro';
import { deleteCatch, useCatch, useUserId } from '@/features/catches/hooks';
import { parseTs, speciesLabel } from '@/features/catches/model';
import { useUnits } from '@/features/profile/hooks';
import { formatTemp, formatWind, weatherLabel } from '@/features/weather/openMeteo';
import { colors, radius, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

export default function CatchDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const userId = useUserId();
  const { data: c, isLoading } = useCatch(id);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
        <ArrowLeft size={24} color={colors.text} />
      </Pressable>
      <Text style={[type.muted, { flex: 1 }]}>CatchLog / Catch Details</Text>
      {c && c.user_id === userId && (
        <Pressable
          onPress={() => router.push({ pathname: '/catch/new', params: { id: c.id } })}
          hitSlop={12}
          accessibilityLabel="Edit catch">
          <Pencil size={20} color={colors.text} />
        </Pressable>
      )}
    </View>
  );

  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        {!isLoading && <EmptyState icon={Fish} title="Catch not found" body="It may have been deleted." />}
      </View>
    );
  }

  const caught = parseTs(c.caught_at);
  const weather = c.weather;
  const astro = c.lat != null && c.lng != null ? astroAt(caught, c.lat, c.lng) : null;
  const mine = c.user_id === userId;

  const confirmDelete = () =>
    Alert.alert('Delete this catch?', 'This removes it from all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCatch(c.id, c.photo_path).catch((e) => Alert.alert('Could not delete', String(e)));
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={{ gap: 2 }}>
          <Text style={type.title}>{speciesLabel(c)}</Text>
          {c.species?.scientific_name && (
            <Text style={type.muted}>
              <Text style={{ fontStyle: 'italic' }}>{c.species.scientific_name}</Text>
              {c.species.common_name_fr ? ` · ${c.species.common_name_fr}` : ''}
            </Text>
          )}
        </View>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <CatchPhoto photoPath={c.photo_path} photoUrl={c.photo_url} style={styles.photo} iconSize={48} />
          <View style={{ padding: space.lg, gap: space.xs }}>
            {(c.waterbody || c.place_name) && (
              <Pressable
                style={styles.inline}
                disabled={!c.waterbody_id}
                onPress={() => c.waterbody_id && router.push({ pathname: '/lake/[id]', params: { id: c.waterbody_id } })}>
                <MapPin size={16} color={colors.textMuted} />
                <Text style={[type.body, c.waterbody_id && styles.linkText]}>{[c.waterbody, c.place_name].filter(Boolean).join(' • ')}</Text>
              </Pressable>
            )}
            <View style={styles.inline}>
              <Clock size={16} color={colors.textMuted} />
              <Text style={type.muted}>
                {caught.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} •{' '}
                {caught.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.stats}>
          <StatTile
            label="Weight"
            value={formatWeight(c.weight_g, units)}
            unit={weightUnit(units)}
            sub={c.weight_estimated ? 'estimated' : undefined}
          />
          <StatTile label="Length" value={formatLength(c.length_mm, units)} unit={lengthUnit(units)} />
          <StatTile
            label="Time"
            value={caught.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            sub={caught.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          />
        </View>

        {(weather || astro) && (
          <Section title="Conditions" icon={Sun}>
            {weather && (
              <>
                <View style={styles.pills}>
                  <InfoPill icon={Sun} label="Weather" value={`${formatTemp(weather.temp_c, units)}, ${weatherLabel(weather.weather_code)}`} />
                  <InfoPill icon={Wind} label="Wind" value={formatWind(weather.wind_kph, weather.wind_dir_deg, units)} />
                </View>
                <Text style={type.muted}>Pressure {Math.round(weather.pressure_hpa)} hPa</Text>
              </>
            )}
            {astro && (
              <>
                <View style={styles.pills}>
                  <InfoPill icon={Moon} label="Moon" value={`${astro.moonPhase} · ${Math.round(astro.moonIllumination * 100)}%`} />
                  <InfoPill icon={Sunrise} label="Sun" value={`${fmtTime(astro.sunrise)} – ${fmtTime(astro.sunset)}`} />
                </View>
                <Text style={type.muted}>
                  {astro.inPeriod
                    ? `Caught during a solunar ${astro.inPeriod.kind} period (${fmtTime(astro.inPeriod.start)}–${fmtTime(astro.inPeriod.end)}).`
                    : `Solunar: ${astro.periods.map((p) => `${p.kind} ${fmtTime(p.start)}`).join(', ') || 'none this day'}.`}
                </Text>
              </>
            )}
          </Section>
        )}

        {(c.lure || c.line_lb) && (
          <Section title="Tackle" icon={Anchor}>
            <View style={styles.tackle}>
              <Anchor size={18} color={colors.primary} />
              <Text
                style={[type.body, { flex: 1, fontWeight: '600' }, mine && c.gear_id ? styles.linkText : null]}
                onPress={mine && c.gear_id ? () => router.push({ pathname: '/gear/edit', params: { id: c.gear_id! } }) : undefined}>
                {c.lure ?? 'Unknown lure'}
              </Text>
              {c.line_lb ? <Text style={type.muted}>{c.line_lb}lb line</Text> : null}
            </View>
          </Section>
        )}

        {c.notes && (
          <Section title="Notes" icon={NotebookPen}>
            <View style={styles.notes}>
              <Text style={[type.body, { lineHeight: 22 }]}>{c.notes}</Text>
            </View>
          </Section>
        )}

        <Text style={[type.muted, { textAlign: 'center' }]}>
          {c.released ? 'Released' : 'Kept'} · Visible to {c.visibility === 'private' ? 'only you' : c.visibility}
        </Text>

        {mine && <Button label="Delete Catch" icon={Trash2} variant="ghost" onPress={confirmDelete} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  linkText: { color: colors.primary, textDecorationLine: 'underline' },
  stats: { flexDirection: 'row', gap: space.sm },
  pills: { flexDirection: 'row', gap: space.sm },
  tackle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: space.md,
  },
  notes: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space.lg },
});
