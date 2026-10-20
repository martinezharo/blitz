import { useEffect, useState, useSyncExternalStore } from 'react';
import { type Day, dayId, dayOf, streakOf } from '@blitz/core/streak.ts';
import { db } from './db.ts';
import { useLiveData } from './live.ts';
import { requestSync } from './sync.ts';

/** A streak that has just grown, from one count to the next, waiting to be shown. */
export interface Growth {
  from: number;
  to: number;
}

let growth: Growth | null = null;
const listeners = new Set<() => void>();

function setGrowth(next: Growth | null) {
  growth = next;
  for (const listener of listeners) listener();
}

/** The growth not celebrated yet, if any. Only this device's own practice makes one. */
export function useGrowth(): [Growth | null, () => void] {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => growth,
  );
  return [current, () => setGrowth(null)];
}

/**
 * Marks today as practised, the first time a question is answered on it.
 * Later answers the same day change nothing, so this is cheap to call on every one.
 */
export async function markPracticed(now = Date.now()): Promise<void> {
  const today = dayOf(now);
  const grown = await db.transaction('rw', db.days, db.pending, async () => {
    if (await db.days.get(today)) return null;
    const before = streakOf(await db.days.toCollection().primaryKeys(), today).count;
    await db.days.add({ day: today, updatedAt: now });
    await db.pending.put({ id: dayId(today), at: now, kind: 'day' });
    return { from: before, to: before + 1 };
  });
  if (!grown) return;
  setGrowth(grown);
  requestSync();
}

/** Today, kept current past midnight and when the app comes back to the front. */
export function useToday(): Day {
  const [today, setToday] = useState(() => dayOf(Date.now()));
  useEffect(() => {
    const check = () => setToday(dayOf(Date.now()));
    const midnight = new Date();
    midnight.setHours(24, 0, 1, 0);
    const timer = setTimeout(check, midnight.getTime() - Date.now());
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [today]);
  return today;
}

/** The days practised, every language together. `undefined` while they load. */
export function usePracticeDays(): Day[] | undefined {
  return useLiveData(() => db.days.toCollection().primaryKeys(), []);
}
