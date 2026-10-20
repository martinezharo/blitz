import type { ListSummary, ListWords } from '@blitz/core/lists.ts';
import { API } from './api.ts';

/**
 * The ready-made lists are static files made at build time, as on the web: an
 * index of all of them, loaded once, and one file per list, loaded when it is
 * opened. Each is asked for once; a failure is not remembered.
 */

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let loading = cache.get(path) as Promise<T> | undefined;
  if (!loading) {
    loading = fetch(`${API}${path}`).then(async (response) => {
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return (await response.json()) as T;
    });
    loading.catch(() => cache.delete(path));
    cache.set(path, loading);
  }
  return loading;
}

export const loadList = (id: string) => load<ListWords>(`/lists/${encodeURIComponent(id)}.json`);
export const loadListIndex = () => load<ListSummary[]>('/lists/index.json');
