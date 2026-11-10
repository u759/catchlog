import { router, useLocalSearchParams } from 'expo-router';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FishMark } from '@/components/FishMark';
import { AppHeader } from '@/components/AppHeader';
import { conditionRows } from '@/components/ConditionRows';
import { PhotoPager } from '@/components/PhotoPager';
import { Button, EmptyState, Facts, Group, Row, Section } from '@/components/ui';
import { astroAt } from '@/features/astro/astro';
import { deleteCatch, useCatch, useCatchPhotos, useUserId } from '@/features/catches/hooks';
import { parseTs, speciesLabel } from '@/features/catches/model';
import { useUnits } from '@/features/profile/hooks';
import { colors, radius, space, touch, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

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
        {!isLoading && <EmptyState icon={FishMark} title="Catch not found" body="It may have been deleted." />}
      </View>
    );
  }

  const caught = parseTs(c.caught_at);
  const weather = c.weather;
  const astro = c.lat != null && c.lng != null ? astroAt(caught, c.lat, c.lng) : null;

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

        {(c.lake_name || c.waterbody || c.place_name) && (
          <Group>
            {c.lake_name && c.waterbody_id ? (
              <Row
                label={c.lake_name}
                sub="Lake"
                onPress={() => router.push({ pathname: '/lake/[id]', params: { id: c.waterbody_id! } })}
              />
            ) : null}
            {c.waterbody && c.waterbody !== c.lake_name ? <Row label={c.waterbody} sub={c.lake_name ? 'Spot' : 'Lake or spot'} /> : null}
            {c.place_name ? <Row label={c.place_name} sub="Place" /> : null}
          </Group>
        )}

        {(weather || astro || c.conditions) && (
          <Section title="Conditions">
            <Group>
              {conditionRows(
                {
                  weather,
                  tide: c.conditions?.tide,
                  gauge: c.conditions?.water,
                  seaTempC: c.conditions?.sea_temp?.temp_c,
                  astro,
                  when: 'catch',
                  gaugeLabel: true,
                },
                units,
              )}
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
