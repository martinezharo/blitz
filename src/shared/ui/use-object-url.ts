import { useLayoutEffect, useState } from 'react';

/**
 * One URL per stored Blob, shared by everything that shows it and revoked once
 * nothing does. Sharing it is what lets a picture decoded ahead of time (see
 * `usePreloadedImage`) paint at once when it is shown: the browser keeps
 * decoded images by URL. The revoke waits a moment, so a component that
 * remounts at once (React's StrictMode does) keeps the same URL.
 */
const urls = new Map<Blob, { url: string; users: number }>();

function acquire(blob: Blob): string {
  const entry = urls.get(blob) ?? { url: URL.createObjectURL(blob), users: 0 };
  entry.users++;
  urls.set(blob, entry);
  return entry.url;
}

function release(blob: Blob) {
  const entry = urls.get(blob);
  if (!entry) return;
  entry.users--;
  setTimeout(() => {
    if (entry.users > 0 || urls.get(blob) !== entry) return;
    urls.delete(blob);
    URL.revokeObjectURL(entry.url);
  }, 1000);
}

/**
 * The picture each word was last shown with. Every read from IndexedDB brings
 * new Blobs for the same pictures, and a new Blob gets a new URL, which the
 * browser loads and decodes again: without this, a thumbnail blanked for a
 * frame whenever any word changed (a practice answer, a sync, a new word), and
 * a photo decoded ahead for a lesson's next question was decoded for nothing.
 */
const shownPhotos = new Map<string, Blob>();

/**
 * The Blob to show for a word's picture: the one it was already shown with,
 * unless the picture really changed. Only for showing it; what is saved is
 * always the word's own, freshly read Blob.
 */
export function shownPhoto(word: { id: string; photo: Blob | null }): Blob | null {
  const shown = shownPhotos.get(word.id);
  if (!word.photo) {
    shownPhotos.delete(word.id);
    return null;
  }
  // A replaced picture is a different file, so its size tells it apart.
  if (shown && shown.size === word.photo.size && shown.type === word.photo.type) return shown;
  shownPhotos.set(word.id, word.photo);
  return word.photo;
}

/**
 * A displayable URL for a stored Blob, revoked when the Blob changes. Made in a
 * layout effect so it is there before the first paint: made any later, an image
 * shows up a frame after its question and everything below it jumps.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    setUrl(acquire(blob));
    return () => release(blob);
  }, [blob]);
  return url;
}

/**
 * Decodes a stored picture before it is needed, under the same URL
 * `useObjectUrl` will give it, so it shows on its first frame instead of
 * leaving its box empty while it decodes.
 */
export function usePreloadedImage(blob: Blob | null) {
  useLayoutEffect(() => {
    if (!blob) return;
    const image = new Image();
    image.src = acquire(blob);
    image.decode().catch(() => {});
    return () => release(blob);
  }, [blob]);
}
