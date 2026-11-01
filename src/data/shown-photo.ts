/**
 * The picture each word was last shown with. Every read from IndexedDB brings
 * new Blobs for the same pictures, and a new Blob gets a new URL, which the
 * browser loads and decodes again: without this, a thumbnail blanked for a
 * frame whenever any word changed (a practice answer, a sync, a new word), and
 * a photo decoded ahead for a lesson's next question was decoded for nothing.
 */
const shown = new Map<string, { blob: Blob; key: string | null }>();

/**
 * The Blob to show for a word's picture: the one it was already shown with,
 * unless the picture really changed. Only for showing it; what is saved is
 * always the word's own, freshly read Blob.
 *
 * A picture saved on this device is dropped by `forgetShownPhoto`. One that
 * arrives from another device has a new sync key, and its size and type are
 * checked too.
 */
export function shownPhoto(word: { id: string; photo: Blob | null; photoKey?: string | null }): Blob | null {
  const entry = shown.get(word.id);
  if (!word.photo) {
    shown.delete(word.id);
    return null;
  }
  const key = word.photoKey ?? null;
  const same =
    entry &&
    entry.blob.size === word.photo.size &&
    entry.blob.type === word.photo.type &&
    // A key appears once the picture is uploaded: the same picture, now keyed.
    (!entry.key || !key || entry.key === key);
  if (same) {
    entry.key ??= key;
    return entry.blob;
  }
  shown.set(word.id, { blob: word.photo, key });
  return word.photo;
}

/** Called when a word's picture is replaced, so the old one is not shown again. */
export function forgetShownPhoto(id: string) {
  shown.delete(id);
}
