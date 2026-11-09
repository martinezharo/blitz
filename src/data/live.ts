import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useSyncExternalStore } from 'react';

/**
 * Pages in the background stay away from the database.
 *
 * Android freezes pages it is not showing, and a page frozen in the middle of
 * a transaction keeps it open, with its locks, until it is shown again. With
 * Blitz open both in a browser tab and as the installed app, the one in the
 * background could hold the other's writes forever: answers never saved, and
 * a word list that never loaded. So a hidden page lets go of the database
 * (db.ts), its live queries pause, and sync waits (sync.ts) until it is shown.
 */

const subscribe = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

export const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Whether the page is on screen. */
function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !pageHidden(),
    () => true,
  );
}

const HIDDEN = Symbol('hidden');

/**
 * `useLiveQuery`, but only while the page is on screen. Hidden, it keeps the
 * last result without reading anything, and reads afresh once it is back.
 */
export function useLiveData<T>(querier: () => Promise<T>, deps: unknown[]): T | undefined {
  const visible = usePageVisible();
  const last = useRef<T | undefined>(undefined);
  const result = useLiveQuery<T | typeof HIDDEN>(() => (visible ? querier() : HIDDEN), [visible, ...deps]);
  if (result === HIDDEN) return last.current;
  last.current = result;
  return result;
}
