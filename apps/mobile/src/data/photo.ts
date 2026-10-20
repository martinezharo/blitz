import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { newId } from './words.ts';

const MAX_SIDE = 640;
const photos = new Directory(Paths.document, 'photos');

/**
 * Shrinks a picked image to a small JPEG and keeps it beside the others: phone
 * photos are several megabytes and a word only ever shows a thumbnail-sized
 * picture. The URI is what a word stores; the bytes go to the account when it
 * syncs, under the SHA-256 of what is on disk.
 */
export async function pickPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;

  const widest = Math.max(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (widest > MAX_SIDE) {
    // Proportional: give the longer side, and the other follows.
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  if (!photos.exists) photos.create({ intermediates: true, idempotent: true });
  const kept = new File(photos, `${newId()}.jpg`);
  await new File(saved.uri).copy(kept);
  return kept.uri;
}

/** Forgets a picture the person removed, once nothing points at it. */
export function deletePhoto(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or not ours: nothing to do.
  }
}
