import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { useLiveQuery } from '@/lib/sync/db';
import { colors, radius, space, type } from '@/theme';

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
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        <Text style={type.muted}>CatchLog is a non-commercial hobby app. These sources make it work offline.</Text>
        {sources.map((s) => (
          <Pressable key={s.key} style={styles.card} disabled={!s.url} onPress={() => s.url && WebBrowser.openBrowserAsync(s.url)}>
            <Text style={type.heading}>{s.name}</Text>
            {s.used_for ? <Text style={type.body}>{s.used_for}</Text> : null}
            <Text style={type.muted}>{s.attribution}</Text>
            <Text style={type.muted}>{s.licence}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: 4 },
});
