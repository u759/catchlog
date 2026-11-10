import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { BookOpen, Camera, LayoutGrid, Map as MapIcon, Package } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, shadow } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 88, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Logbook', tabBarIcon: ({ color }) => <LayoutGrid size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="dex"
        options={{ title: 'Dex', tabBarIcon: ({ color }) => <BookOpen size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.cameraSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log a new catch"
                onPress={() => router.push('/catch/new')}
                style={({ pressed }) => [styles.cameraButton, pressed && { opacity: 0.85 }]}>
                <Camera size={26} color={colors.onPrimary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Map', tabBarIcon: ({ color }) => <MapIcon size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="gear"
        options={{ title: 'Gear', tabBarIcon: ({ color }) => <Package size={22} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  cameraSlot: { flex: 1, alignItems: 'center' },
  cameraButton: {
    marginTop: -22,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    ...shadow,
  },
});
