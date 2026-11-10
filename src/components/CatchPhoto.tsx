import { Image } from 'expo-image';
import { Fish } from 'lucide-react-native';
import { type ImageStyle, StyleSheet, View, type ViewStyle } from 'react-native';

import { localPhotoUri } from '@/features/catches/photos';
import { colors } from '@/theme';

type Props = {
  catchId: string;
  photoPath?: string | null;
  photoUrl?: string | null;
  style?: ImageStyle;
  iconSize?: number;
};

/**
 * Prefers the on-device copy (works offline + for unsynced catches), then the signed URL.
 * cacheKey = storage path, so expo-image's disk cache survives signed-URL rotation.
 */
export function CatchPhoto({ catchId, photoPath, photoUrl, style, iconSize = 28 }: Props) {
  const local = localPhotoUri(catchId);
  const source = local
    ? { uri: local }
    : photoUrl
      ? { uri: photoUrl, cacheKey: photoPath ?? undefined }
      : null;

  if (!source) {
    return (
      <View style={[styles.placeholder, style as ViewStyle]}>
        <Fish size={iconSize} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={source}
      style={[styles.image, style]}
      contentFit="cover"
      // Local files can be overwritten on edit (same path), so don't cache them.
      cachePolicy={local ? 'none' : 'disk'}
      transition={150}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  placeholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
