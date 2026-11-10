import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Photos are compressed and copied into the app's document directory immediately, so a catch
// logged with no signal keeps its photo across app restarts until the upload queue drains.
// The local copy is kept afterwards as an offline cache for your own catches.
const photosDir = () => new Directory(Paths.document, 'photos');

export const localPhotoFile = (catchId: string) => new File(photosDir(), `${catchId}.jpg`);

export function localPhotoUri(catchId: string): string | null {
  const f = localPhotoFile(catchId);
  return f.exists ? f.uri : null;
}

/** Resize to max 1600px, JPEG 80%, and store as photos/{catchId}.jpg. Returns the local uri. */
export async function storeCatchPhoto(sourceUri: string, catchId: string, width?: number, height?: number) {
  const ctx = ImageManipulator.manipulate(sourceUri);
  const landscape = (width ?? 0) >= (height ?? 0);
  if (Math.max(width ?? 0, height ?? 0) > 1600 || !width) {
    ctx.resize(landscape ? { width: 1600 } : { height: 1600 });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const dir = photosDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = localPhotoFile(catchId);
  if (dest.exists) dest.delete();
  await new File(result.uri).move(dest);
  return dest.uri;
}

export function deleteLocalPhoto(catchId: string) {
  const f = localPhotoFile(catchId);
  if (f.exists) f.delete();
}
