import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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
