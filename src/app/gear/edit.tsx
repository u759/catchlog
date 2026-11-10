import { router, useLocalSearchParams } from 'expo-router';
import { Check, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/AppHeader';
import { Button, Chip, Field, Group, Row, Section, Sheet } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { deleteGear, type Gear, saveGear, useGear } from '@/features/gear/hooks';
import { categoryLabel, GEAR_CATEGORIES, GEAR_GROUPS, hasLureDetails } from '@/features/gear/taxonomy';
import { useUnits } from '@/features/profile/hooks';
import { colors, space, type } from '@/theme';
import { formatLureWeight, lureWeightUnit, parseLureWeight } from '@/utils/units';

/** /gear/edit = add; /gear/edit?id=… = edit. */
export default function GearEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useGear(id);
  if (id && !existing) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <GearForm existing={existing} />;
}

function GearForm({ existing }: { existing: Gear | null }) {
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const units = useUnits();
  const [category, setCategory] = useState(existing?.category ?? 'soft-plastic');
  const [subtype, setSubtype] = useState<string | null>(existing?.subtype ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [color, setColor] = useState(existing?.color ?? '');
  const [size, setSize] = useState(existing?.size ?? '');
  const [weight, setWeight] = useState(formatLureWeight(existing?.weight_g, units));
  const [hook, setHook] = useState(existing?.hook_size ?? '');
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const subtypes = GEAR_CATEGORIES.find((c) => c.key === category)?.subtypes ?? [];
  const lureDetails = hasLureDetails(category);
  const [typeOpen, setTypeOpen] = useState(false);
  const { height: windowH } = useWindowDimensions();

  const onSave = async () => {
    if (!userId) return;
    if (!name.trim()) return Alert.alert('Give it a name', 'For example “5" Senko” or “Rapala X-Rap 10”.');
    await saveGear(
      userId,
      {
        category,
        subtype,
        name: name.trim(),
        brand: brand.trim() || null,
        color: lureDetails ? color.trim() || null : null,
        size: size.trim() || null,
        weight_g: lureDetails ? parseLureWeight(weight, units) : null,
        hook_size: lureDetails ? hook.trim() || null : null,
        quantity: quantity ? Number.parseInt(quantity, 10) || null : null,
        notes: notes.trim() || null,
      },
      existing?.id,
    );
    router.back();
  };

  const onDelete = () =>
    Alert.alert('Delete this item?', 'Catches logged with it keep the lure name.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGear(existing!.id);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ModalHeader title={existing ? 'Edit gear' : 'Add gear'} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label="Name" placeholder='e.g. 5" Senko' value={name} onChangeText={setName} autoFocus={!existing}
          returnKeyType="done" />

        <View style={{ gap: space.sm }}>
          <Group>
            <Row label="Type" value={categoryLabel(category)} onPress={() => setTypeOpen(true)} />
          </Group>
          {subtypes.length > 0 && (
            <View style={{ gap: space.xs }}>
              <Text style={type.caption}>Style (optional)</Text>
              <View style={styles.chips}>
                {subtypes.map((s) => (
                  <Chip key={s} label={s} selected={subtype === s} onPress={() => setSubtype(subtype === s ? null : s)} />
                ))}
              </View>
            </View>
          )}
        </View>

        <Section title="Details (optional)">
          <View style={styles.row}>
            <Field label="Brand" placeholder="Yamamoto" value={brand} onChangeText={setBrand} />
            {lureDetails ? <Field label="Colour" placeholder="Watermelon" value={color} onChangeText={setColor} /> : null}
          </View>
          <View style={styles.row}>
            <Field label="Size" placeholder={lureDetails ? '5"' : "7'"} value={size} onChangeText={setSize} />
            {lureDetails ? (
              <Field label="Weight" placeholder="7" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix={lureWeightUnit(units)} />
            ) : null}
          </View>
          <View style={styles.row}>
            {lureDetails ? <Field label="Hook size" placeholder="3/0" value={hook} onChangeText={setHook} /> : null}
            <Field label="How many" placeholder="1" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          </View>
          <Field label="Notes" placeholder="Rigging, where it works…" value={notes} onChangeText={setNotes} multiline
            style={{ ...type.body, minHeight: 80, textAlignVertical: 'top', paddingVertical: space.md }} />
        </Section>
        {existing && <Button label="Delete from tackle box" icon={Trash2} variant="danger" onPress={onDelete} style={{ alignSelf: 'flex-start' }} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label={existing ? 'Save changes' : 'Add to tackle box'} onPress={onSave} />
      </View>
      <Sheet visible={typeOpen} title="Type" onClose={() => setTypeOpen(false)}>
        {(close) => (
          <ScrollView style={{ maxHeight: windowH * 0.6 }} contentContainerStyle={{ gap: space.lg }}>
            {GEAR_GROUPS.map((g) => (
              <Section key={g} title={g}>
                <Group>
                  {GEAR_CATEGORIES.filter((c) => c.group === g).map((c) => (
                    <Row
                      key={c.key}
                      label={c.label}
                      right={category === c.key ? <Check size={20} color={colors.primary} /> : null}
                      onPress={() =>
                        close(() => {
                          if (c.key !== category) setSubtype(null);
                          setCategory(c.key);
                        })
                      }
                    />
                  ))}
                </Group>
              </Section>
            ))}
          </ScrollView>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
