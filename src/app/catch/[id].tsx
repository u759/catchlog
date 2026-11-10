import { router, useLocalSearchParams } from 'expo-router';
import { Fish, Pencil, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { PhotoPager } from '@/components/PhotoPager';
import { Button, EmptyState, Facts, Group, Row, Section } from '@/components/ui';
import { astroAt, fmtTime } from '@/features/astro/astro';
import { deleteCatch, useCatch, useCatchPhotos, useUserId } from '@/features/catches/hooks';
import { parseTs, speciesLabel } from '@/features/catches/model';
import { useUnits } from '@/features/profile/hooks';
import { formatTemp, formatWind, weatherLabel } from '@/features/weather/openMeteo';
import { colors, radius, space, touch, type } from '@/theme';
import { formatFlow, formatLength, formatLevel, formatTideHeight, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

export default function CatchDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const units = useUnits();
  const userId = useUserId();
  const { data: c, isLoading } = useCatch(id);
  const mine = !!c && c.user_id === userId;
  const { photos } = useCatchPhotos(c);

  const header = (
    <AppHeader
      back
      right={
        mine ? (
          <Pressable
            onPress={() => router.push({ pathname: '/catch/new', params: { id: c.id } })}
            accessibilityRole="button"
            accessibilityLabel="Edit catch"
            style={styles.iconButton}>
            <Pencil size={20} color={colors.text} />
          </Pressable>
        ) : null
      }
    />
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
  const tide = c.conditions?.tide;
  const gauge = c.conditions?.water;
  const sea = c.conditions?.sea_temp;
  // Gauge readings, one row each; the station is named once, under the last.
  const gaugeRows = gauge
    ? [
        gauge.temp_c != null && { label: 'Water temperature', value: formatTemp(gauge.temp_c, units) },
        gauge.level_m != null && { label: 'Water level', value: formatLevel(gauge.level_m, units) },
        gauge.flow_m3s != null && { label: 'Flow', value: formatFlow(gauge.flow_m3s, units) },
      ].filter((r): r is { label: string; value: string } => !!r)
    : [];

  const confirmDelete = () =>
    Alert.alert('Delete this catch?', 'It is removed from all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCatch(c.id).catch(() => Alert.alert('Could not delete', 'Please try again.'));
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <PhotoPager photos={photos} style={styles.photo} />

        <View style={{ gap: space.xs }}>
          <Text style={type.title}>{speciesLabel(c)}</Text>
          {c.species?.scientific_name ? (
            <Text style={type.secondary}>
              <Text style={{ fontStyle: 'italic' }}>{c.species.scientific_name}</Text>
              {c.species.common_name_fr ? `  ·  ${c.species.common_name_fr}` : ''}
            </Text>
          ) : null}
          <Text style={[type.headline, styles.measures]}>
            {[
              c.weight_g != null && `${formatWeight(c.weight_g, units)} ${weightUnit(units)}${c.weight_estimated ? ' (est.)' : ''}`,
              c.length_mm != null && `${formatLength(c.length_mm, units)} ${lengthUnit(units)}`,
            ]
              .filter(Boolean)
              .join('  ·  ') || 'No measurements'}
          </Text>
          <Facts
            items={[
              caught.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
              caught.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              c.released ? 'Released' : 'Kept',
            ]}
          />
        </View>

        {(c.waterbody || c.place_name) && (
          <Group>
            {c.waterbody ? (
              <Row
                label={c.waterbody}
                sub="Lake"
                onPress={c.waterbody_id ? () => router.push({ pathname: '/lake/[id]', params: { id: c.waterbody_id! } }) : undefined}
              />
            ) : null}
            {c.place_name ? <Row label={c.place_name} sub="Place" /> : null}
          </Group>
        )}

        {(weather || astro || c.conditions) && (
          <Section title="Conditions">
            <Group>
              {weather ? <Row label="Weather" value={`${formatTemp(weather.temp_c, units)}, ${weatherLabel(weather.weather_code)}`} /> : null}
              {weather ? <Row label="Wind" value={formatWind(weather.wind_kph, weather.wind_dir_deg, units)} /> : null}
              {weather ? <Row label="Air pressure" value={`${Math.round(weather.pressure_hpa)} hPa`} /> : null}
              {tide ? (
                <Row
                  label="Tide"
                  value={`${tide.trend === 'rising' ? 'Rising' : 'Falling'}, ${formatTideHeight(tide.height_m, units)}`}
                  sub={[
                    tide.next &&
                      `${tide.next.kind === 'high' ? 'High' : 'Low'} ${formatTideHeight(tide.next.height_m, units)} at ${fmtTime(parseTs(tide.next.at))}`,
                    tide.station,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ) : null}
              {gaugeRows.map((r, i) => (
                <Row key={r.label} label={r.label} value={r.value} sub={i === gaugeRows.length - 1 ? `Gauge: ${gauge!.station}` : null} />
              ))}
              {sea ? <Row label="Sea temperature" value={formatTemp(sea.temp_c, units)} sub="Satellite, daily average" /> : null}
              {astro ? <Row label="Moon" value={`${astro.moonPhase}, ${Math.round(astro.moonIllumination * 100)}%`} /> : null}
              {astro ? <Row label="Sunrise – sunset" value={`${fmtTime(astro.sunrise)} – ${fmtTime(astro.sunset)}`} /> : null}
              {astro ? (
                <Row
                  label="Solunar"
                  numberOfLines={2}
                  sub={
                    astro.inPeriod
                      ? `Caught in a ${astro.inPeriod.kind} feeding period (${fmtTime(astro.inPeriod.start)}–${fmtTime(astro.inPeriod.end)})`
                      : astro.periods.map((p) => `${p.kind} ${fmtTime(p.start)}`).join(', ') || 'No periods this day'
                  }
                />
              ) : null}
            </Group>
          </Section>
        )}

        {(c.lure || c.line_lb) && (
          <Section title="Tackle">
            <Group>
              {c.lure ? (
                <Row
                  label={c.lure}
                  onPress={mine && c.gear_id ? () => router.push({ pathname: '/gear/edit', params: { id: c.gear_id! } }) : undefined}
                />
              ) : null}
              {c.line_lb ? <Row label="Line" value={`${c.line_lb} lb`} /> : null}
            </Group>
          </Section>
        )}

        {c.notes ? (
          <Section title="Notes">
            <Text style={type.body}>{c.notes}</Text>
          </Section>
        ) : null}

        <Text style={type.secondary}>
          Visible to {c.visibility === 'private' ? 'only you' : c.visibility === 'friends' ? 'your friends' : 'everyone'}
        </Text>

        {mine && <Button label="Delete catch" icon={Trash2} variant="danger" onPress={confirmDelete} style={{ alignSelf: 'flex-start' }} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl * 2 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  measures: { fontVariant: ['tabular-nums'], marginTop: space.xs },
  iconButton: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
});
