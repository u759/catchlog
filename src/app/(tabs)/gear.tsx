import { router } from 'expo-router';
import { Package, Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, EmptyState, Facts } from '@/components/ui';
import { type GearWithStats, useGearList } from '@/features/gear/hooks';
import { categoryLabel, GEAR_CATEGORIES } from '@/features/gear/taxonomy';
import { colors, radius, space, touch, type } from '@/theme';

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
      <AppHeader
        title="Gear"
        right={
          gear.length > 0 ? (
            <Pressable onPress={() => router.push('/gear/edit')} accessibilityRole="button" accessibilityLabel="Add gear"
              style={styles.addButton}>
              <Plus size={22} color={colors.onPrimary} />
            </Pressable>
          ) : null
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(g) => g.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.xxl }}
        ListHeaderComponent={
          gear.length > 0 ? (
            <Facts
              style={{ marginBottom: space.sm }}
              items={[
                `${totalItems} item${totalItems === 1 ? '' : 's'}`,
                fishOnGear > 0 && `${fishOnGear} fish caught on them`,
                top && `best: ${top.name}`,
              ]}
            />
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <Text style={[type.headline, styles.sectionTitle]} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <GearRow g={item} first={index === 0} last={index === section.data.length - 1} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={Package}
            title="Your tackle box is empty"
            body="Add the lures and gear you fish with, then pick them when you log a catch to see what actually works."
            action={<Button label="Add gear" icon={Plus} onPress={() => router.push('/gear/edit')} style={{ alignSelf: 'stretch' }} />}
          />
        }
      />
    </View>
  );
}

function GearRow({ g, first, last }: { g: GearWithStats; first: boolean; last: boolean }) {
  const detail = [g.subtype, g.brand, g.color, g.size].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        first && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
        last && { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
        !first && styles.divider,
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.push({ pathname: '/gear/edit', params: { id: g.id } })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.headline} numberOfLines={1}>
          {g.name}
          {g.quantity != null && g.quantity > 1 ? <Text style={type.secondary}>  ×{g.quantity}</Text> : null}
        </Text>
        <Text style={type.secondary} numberOfLines={1}>
          {detail || categoryLabel(g.category)}
        </Text>
        {g.species ? (
          <Text style={type.secondary} numberOfLines={1}>
            Caught: {g.species.split(',').slice(0, 3).join(', ')}
          </Text>
        ) : null}
      </View>
      <Text style={[type.body, styles.count]}>{g.catches > 0 ? `${g.catches} fish` : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginTop: space.xl, marginBottom: space.sm },
  addButton: {
    width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, paddingHorizontal: space.lg,
    paddingVertical: space.md, minHeight: 56,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  count: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
