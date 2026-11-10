import { router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/AppHeader';
import { Button, Chip, Field } from '@/components/ui';
import { useUserId } from '@/features/catches/hooks';
import { deleteGear, type Gear, saveGear, useGear } from '@/features/gear/hooks';
import { GEAR_CATEGORIES } from '@/features/gear/taxonomy';
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
        color: color.trim() || null,
        size: size.trim() || null,
        weight_g: parseLureWeight(weight, units),
        hook_size: hook.trim() || null,
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
        <View style={{ gap: space.xs }}>
          <Text style={type.caption}>Type</Text>
          <View style={styles.chips}>
            {GEAR_CATEGORIES.map((c) => (
              <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => { setCategory(c.key); setSubtype(null); }} />
            ))}
          </View>
        </View>
        {subtypes.length > 0 && (
          <View style={styles.chips}>
            {subtypes.map((s) => (
              <Chip key={s} label={s} selected={subtype === s} onPress={() => setSubtype(subtype === s ? null : s)} />
            ))}
          </View>
        )}
        <Field label="Name" placeholder='e.g. 5" Senko' value={name} onChangeText={setName} />
        <View style={styles.row}>
          <Field label="Brand" placeholder="Yamamoto" value={brand} onChangeText={setBrand} />
          <Field label="Colour" placeholder="Watermelon" value={color} onChangeText={setColor} />
        </View>
        <View style={styles.row}>
          <Field label="Size" placeholder='5"' value={size} onChangeText={setSize} />
          <Field label="Weight" placeholder="7" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix={lureWeightUnit(units)} />
        </View>
        <View style={styles.row}>
          <Field label="Hook size" placeholder="3/0" value={hook} onChangeText={setHook} />
          <Field label="Quantity" placeholder="1" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        </View>
        <Field label="Notes" placeholder="Rigging, where it works…" value={notes} onChangeText={setNotes} multiline
          style={{ ...type.body, minHeight: 80, textAlignVertical: 'top', paddingVertical: space.md }} />
        {existing && <Button label="Delete from tackle box" icon={Trash2} variant="danger" onPress={onDelete} style={{ alignSelf: 'flex-start' }} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button label={existing ? 'Save changes' : 'Add to tackle box'} onPress={onSave} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
