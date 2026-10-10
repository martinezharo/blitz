const MAX_SIDE = 640;

/**
 * Shrinks a picked image to a small WebP before it is stored: phone photos are
 * several megabytes and a word only ever shows a thumbnail-sized picture.
 * Browsers that cannot encode WebP silently hand back a PNG, so those fall back
 * to JPEG, which every browser encodes.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp', 0.75);
  return webp.type === 'image/webp' ? webp : encode(canvas, 'image/jpeg', 0.82);
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read the picture'))), type, quality),
  );
}
