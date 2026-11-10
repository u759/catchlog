import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { BookOpen, Camera, LayoutGrid, Map as MapIcon, Package } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { pickCatchPhotos } from '@/features/catches/photos';
import { colors } from '@/theme';

/**
 * Camera first: the camera opens straight away, then the form with the photo. Cancelling (or a phone without a
 * camera) still opens the form, so you can log without a photo.
 */
async function logCatch() {
  const r = await pickCatchPhotos('camera', 1);
  router.push(Array.isArray(r) && r[0] ? { pathname: '/catch/new', params: { photo: r[0].uri } } : '/catch/new');
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 88, paddingTop: 6 },
        // Tab labels are the platform's small tab size; the weight matches the app's labels.
        tabBarLabelStyle: { fontWeight: '600' },
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
          // In line with the other tabs (not raised), centred in the bar: a filled circle so logging a catch stays the obvious action.
          tabBarButton: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log a new catch"
              onPress={logCatch}
              style={({ pressed }) => [styles.cameraSlot, pressed && { opacity: 0.85 }]}>
              <View style={styles.cameraCircle}>
                <Camera size={22} color={colors.onPrimary} />
              </View>
            </Pressable>
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
  cameraSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
});
