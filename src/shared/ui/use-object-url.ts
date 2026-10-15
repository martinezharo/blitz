import { useLayoutEffect, useState } from 'react';

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
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
