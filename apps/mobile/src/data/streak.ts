import { dayId, dayOf, type Day, streakOf } from '@blitz/core/streak.ts';
import { changed, db } from './db.ts';
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

export const subscribeGrowth = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const currentGrowth = () => growth;
export const settleGrowth = () => setGrowth(null);

/**
 * Marks today as practised, the first time a question is answered on it.
 * Later answers the same day change nothing, so this is cheap to call on every one.
 */
export function markPracticed(now = Date.now()): Growth | null {
  const today = dayOf(now);
  const already = db.getFirstSync<{ day: string }>('SELECT day FROM days WHERE day = ?', today);
  if (already) return null;
  const before = streakOf(practiceDays(), today).count;
  db.withTransactionSync(() => {
    db.runSync('INSERT INTO days (day, updatedAt) VALUES (?, ?)', today, now);
    db.runSync('INSERT INTO pending (id, at, kind) VALUES (?, ?, ?)', dayId(today), now, 'day');
  });
  const grown = { from: before, to: before + 1 };
  setGrowth(grown);
  changed();
  requestSync();
  return grown;
}

/** The days practised, every language together. */
export function practiceDays(): Day[] {
  return db.getAllSync<{ day: Day }>('SELECT day FROM days').map((row) => row.day);
}
