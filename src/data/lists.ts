import { useCallback, useEffect, useState } from 'react';
import type { ListSummary, ListWords } from '../domain/lists.ts';

/**
 * The ready-made lists are static files made at build time (public/lists): an
 * index of all of them, loaded once, and one file per list, loaded when it is
 * opened. Each is asked for once; a failure is not remembered, so opening again tries again.
 */

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let loading = cache.get(path) as Promise<T> | undefined;
  if (!loading) {
    loading = fetch(path).then(async (response) => {
      // A path the app does not have is answered with its own page.
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error(`${path}: ${response.status}`);
      return (await response.json()) as T;
    });
    loading.catch(() => cache.delete(path));
    cache.set(path, loading);
  }
  return loading;
}

export const loadList = (id: string) => load<ListWords>(`/lists/${encodeURIComponent(id)}.json`);

/** Every list, or `null` while they load, or `'failed'`. `retry` asks again. */
export function useListIndex(): { lists: ListSummary[] | null | 'failed'; retry: () => void } {
  const [lists, setLists] = useState<ListSummary[] | null | 'failed'>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLists(null);
    load<ListSummary[]>('/lists/index.json').then(
      (found) => current && setLists(found),
      () => current && setLists('failed'),
    );
    return () => {
      current = false;
    };
  }, [attempt]);
  return { lists, retry: useCallback(() => setAttempt((count) => count + 1), []) };
}
