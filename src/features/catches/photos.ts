import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export { localPhotoUri } from '@/lib/sync/photos';

/** Resize to max 1600px and JPEG 80% into the cache dir. Returns the temp file uri. */
export async function compressPhoto(sourceUri: string, width?: number, height?: number) {
  const ctx = ImageManipulator.manipulate(sourceUri);
  if (!width || !height || Math.max(width, height) > 1600) {
    ctx.resize(width && height && width < height ? { height: 1600 } : { width: 1600 });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return result.uri;
}
