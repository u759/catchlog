import { Image } from 'expo-image';
import { Fish } from 'lucide-react-native';
import { type ImageStyle, StyleSheet, View, type ViewStyle } from 'react-native';

import { useLocalPhotoUri } from '@/lib/sync/photos';
import { colors } from '@/theme';

type Props = {
  photoPath?: string | null;
  /** Signed URL, for catches fetched from the server (friends'). */
  photoUrl?: string | null;
  style?: ImageStyle;
  iconSize?: number;
};

/**
 * Prefers the on-device copy kept by the sync photo queue (works offline), then a signed
 * URL. cacheKey = storage path, so expo-image's disk cache survives signed-URL rotation.
 */
export function CatchPhoto({ photoPath, photoUrl, style, iconSize = 28 }: Props) {
  // Updates when the download lands (e.g. right after signing in on a new phone).
  const local = useLocalPhotoUri(photoPath);
  const source = local ? { uri: local } : photoUrl ? { uri: photoUrl, cacheKey: photoPath ?? undefined } : null;

  if (!source) {
    return (
      <View style={[styles.placeholder, style as ViewStyle]}>
        <Fish size={iconSize} color={colors.textMuted} />
      </View>
    );
  }
  return (
    // expo-image decodes at the view's size (allowDownscaling), so a 52 pt row never holds a full-size photo in memory.
    <Image source={source} style={[styles.image, style]} contentFit="cover" cachePolicy="memory-disk" transition={150}
      recyclingKey={photoPath ?? photoUrl ?? undefined} />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  placeholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
