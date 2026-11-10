import { router, useLocalSearchParams } from 'expo-router';
import { Anchor, ArrowLeft, Clock, Fish, MapPin, NotebookPen, Pencil, Sun, Trash2, Wind } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CatchPhoto } from '@/components/CatchPhoto';
import { Button, Card, EmptyState, InfoPill, Section, StatTile } from '@/components/ui';
import { useCatch, useDeleteCatch, useUserId } from '@/features/catches/hooks';
import { deleteLocalPhoto } from '@/features/catches/photos';
import { useUnits } from '@/features/profile/hooks';
import { formatTemp, formatWind, isWeather, weatherLabel } from '@/features/weather/openMeteo';
import { colors, radius, space, type } from '@/theme';
import { formatLength, formatWeight, lengthUnit, weightUnit } from '@/utils/units';

export default function CatchDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const userId = useUserId();
  const { data: c, isLoading } = useCatch(id);
  const del = useDeleteCatch();

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

  const caught = new Date(c.caught_at);
  const weather = isWeather(c.weather) ? c.weather : null;
  const mine = c.user_id === userId;

  const confirmDelete = () =>
    Alert.alert('Delete this catch?', 'This removes it from all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          del.mutate({ id: c.id, userId: c.user_id });
          deleteLocalPhoto(c.id);
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={type.title}>{c.species?.common_name ?? c.species_other ?? 'Unknown species'}</Text>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <CatchPhoto catchId={c.id} photoPath={c.photo_path} photoUrl={c.photo_url} style={styles.photo} iconSize={48} />
          <View style={{ padding: space.lg, gap: space.xs }}>
            {(c.waterbody || c.place_name) && (
              <View style={styles.inline}>
                <MapPin size={16} color={colors.textMuted} />
                <Text style={type.body}>{[c.waterbody, c.place_name].filter(Boolean).join(' • ')}</Text>
              </View>
            )}
            <View style={styles.inline}>
              <Clock size={16} color={colors.textMuted} />
              <Text style={type.muted}>
                {caught.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} •{' '}
                {caught.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
            {c._pending && <Text style={styles.pending}>Waiting for signal to sync</Text>}
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

        {weather && (
          <Section title="Conditions" icon={Sun}>
            <View style={styles.pills}>
              <InfoPill icon={Sun} label="Weather" value={`${formatTemp(weather.temp_c, units)}, ${weatherLabel(weather.weather_code)}`} />
              <InfoPill icon={Wind} label="Wind" value={formatWind(weather.wind_kph, weather.wind_dir_deg, units)} />
            </View>
            <Text style={type.muted}>Pressure {Math.round(weather.pressure_hpa)} hPa</Text>
          </Section>
        )}

        {(c.lure || c.line_lb) && (
          <Section title="Tackle" icon={Anchor}>
            <View style={styles.tackle}>
              <Anchor size={18} color={colors.primary} />
              <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{c.lure ?? 'Unknown lure'}</Text>
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
  pending: { fontSize: 12, fontWeight: '600', color: colors.onGold, marginTop: space.xs },
});
