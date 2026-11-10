import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export { localPhotoUri } from '@/lib/sync/photos';

/** Resize to max 1440px and JPEG 72% (~150–250 KB) into the cache dir. Returns the temp file uri. */
export async function compressPhoto(sourceUri: string, width?: number, height?: number) {
  const ctx = ImageManipulator.manipulate(sourceUri);
  if (!width || !height || Math.max(width, height) > 1440) {
    ctx.resize(width && height && width < height ? { height: 1440 } : { width: 1440 });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  return result.uri;
}

/** Picked photos, already compressed; or why none: no camera on this device (simulator) or camera access off. */
export type PickResult = { uri: string }[] | 'no-camera' | 'denied';

/** Camera (one photo) or library (up to `room`, in the order tapped). Cancel returns []. */
export async function pickCatchPhotos(source: 'camera' | 'library', room: number): Promise<PickResult> {
  if (room <= 0) return [];
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'denied';
  }
  let res: ImagePicker.ImagePickerResult;
  try {
    res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
            allowsMultipleSelection: room > 1,
            selectionLimit: room,
            orderedSelection: true,
          });
  } catch {
    return source === 'camera' ? 'no-camera' : [];
  }
  if (res.canceled) return [];
  return Promise.all(res.assets.slice(0, room).map(async (a) => ({ uri: await compressPhoto(a.uri, a.width, a.height) })));
}
