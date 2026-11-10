import * as WebBrowser from 'expo-web-browser';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Group } from '@/components/ui';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, space, type } from '@/theme';

type Source = { key: string; name: string; used_for: string | null; licence: string; attribution: string; url: string | null };

// Every external source, with its licence and attribution, from public.data_sources (synced to the phone).
export default function Credits() {
  const { data: sources } = useLiveQuery<Source>(
    'SELECT key, name, used_for, licence, attribution, url FROM data_sources ORDER BY name',
    [],
    ['data_sources'],
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Data sources" back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg, paddingBottom: space.xxl }}>
        <Text style={type.secondary}>Where CatchLog’s data comes from. CatchLog is a free, non-commercial app.</Text>
        <Group>
          {sources.map((s) => {
            // Show the licence on its own line only when the attribution doesn't already name it.
            const licence = s.licence && !s.attribution.toLowerCase().includes(s.licence.toLowerCase().split(' (')[0]) ? s.licence : null;
            return (
              <Pressable
                key={s.key}
                accessibilityRole={s.url ? 'link' : undefined}
                disabled={!s.url}
                onPress={() => s.url && WebBrowser.openBrowserAsync(s.url)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.headline}>{s.name}</Text>
                  {s.used_for ? <Text style={type.body}>{s.used_for}</Text> : null}
                  <Text style={type.secondary}>{s.attribution}</Text>
                  {licence ? <Text style={type.caption}>{licence}</Text> : null}
                </View>
                {s.url ? <ChevronRight size={18} color={colors.textMuted} /> : null}
              </Pressable>
            );
          })}
        </Group>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
