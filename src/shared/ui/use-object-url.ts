import { useLayoutEffect, useState } from 'react';
import type { PhotoValue } from '@blitz/core/word.ts';

/**
 * A displayable URL for a stored picture: a Blob is turned into an object URL,
 * and a file URI on a device is already one. Revoked when the picture changes.
 */
export function useObjectUrl(photo: PhotoValue | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!photo) {
      setUrl(null);
      return;
    }
    if (typeof photo === 'string') {
      setUrl(photo);
      return;
    }
    const next = URL.createObjectURL(photo);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return url;
}
