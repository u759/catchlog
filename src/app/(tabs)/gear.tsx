import { router } from 'expo-router';
import { Package, Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, EmptyState, StatTile } from '@/components/ui';
import { categoryLabel, GEAR_CATEGORIES } from '@/features/gear/taxonomy';
import { type GearWithStats, useGearList } from '@/features/gear/hooks';
import { colors, radius, space, type } from '@/theme';

export default function GearTab() {
  const { data: gear } = useGearList();
  const sections = useMemo(
    () =>
      GEAR_CATEGORIES.map((c) => ({ key: c.key, title: c.label, data: gear.filter((g) => g.category === c.key) })).filter(
        (s) => s.data.length > 0,
      ),
    [gear],
  );
  const totalItems = gear.reduce((n, g) => n + (g.quantity ?? 1), 0);
  const fishOnGear = gear.reduce((n, g) => n + g.catches, 0);
  const top = gear.find((g) => g.catches > 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Gear" />
      <SectionList
        sections={sections}
        keyExtractor={(g) => g.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.sm }}
        ListHeaderComponent={
          gear.length > 0 ? (
            <View style={{ gap: space.md, marginBottom: space.md }}>
              <View style={styles.stats}>
                <StatTile label="Items" value={String(totalItems)} />
                <StatTile label="Fish on gear" value={String(fishOnGear)} />
              </View>
              {top && <Text style={type.muted}>Most productive: {top.name} ({top.catches} fish)</Text>}
            </View>
          ) : undefined
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => <GearRow g={item} />}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon={Package}
            title="Your tackle box is empty"
            body="Add the lures and gear you fish with. Pick them when you log a catch to see what actually works."
          />
        }
        ListFooterComponent={
          <Button label="Add gear" icon={Plus} onPress={() => router.push('/gear/edit')} style={{ marginTop: space.xl }} />
        }
      />
    </View>
  );
}

function GearRow({ g }: { g: GearWithStats }) {
  const detail = [g.subtype, g.brand, g.color, g.size].filter(Boolean).join(' · ');
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      onPress={() => router.push({ pathname: '/gear/edit', params: { id: g.id } })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>
          {g.name}
        </Text>
        <Text style={type.muted} numberOfLines={1}>
          {detail || categoryLabel(g.category)}
        </Text>
        {g.species ? (
          <Text style={styles.species} numberOfLines={1}>
            {g.species.split(',').slice(0, 3).join(', ')}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.count}>{g.catches}</Text>
        <Text style={type.muted}>fish</Text>
        {g.quantity != null && <Text style={type.muted}>×{g.quantity}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm },
  sectionTitle: { ...type.label, marginTop: space.md, marginBottom: space.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: space.md,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  species: { fontSize: 12, color: colors.onAccent, fontWeight: '600' },
  count: { fontSize: 20, fontWeight: '800', color: colors.text },
});
