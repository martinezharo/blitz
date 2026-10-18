import Dexie, { type EntityTable } from 'dexie';
import type { Day } from '../domain/streak.ts';
import type { ChangeKind } from '../domain/sync.ts';
import type { Word } from '../domain/word.ts';
import type { Correction } from '../domain/writing.ts';

/** A local write sync has not sent yet. `at` is the write's `updatedAt`. */
export interface Pending {
  id: string;
  at: number;
  /** What was written, when it is not a word. */
  kind?: ChangeKind;
}

/** A day with at least one question answered, for the practice streak. */
export interface PracticeDay {
  day: Day;
  updatedAt: number;
}

/** Sync bookkeeping: whose words these are and how far this device has pulled. */
export interface Meta {
  key: 'owner' | 'cursor';
  value: string | number;
}

/** The only place that knows words live in IndexedDB. */
export const db = new Dexie('blitz') as Dexie & {
  words: EntityTable<Word, 'id'>;
  /** The grammar history: sentences written with mistakes, and how they should be. */
  corrections: EntityTable<Correction, 'id'>;
  days: EntityTable<PracticeDay, 'day'>;
  pending: EntityTable<Pending, 'id'>;
  meta: EntityTable<Meta, 'key'>;
};

db.version(1).stores({
  words: 'id, language, [language+createdAt], updatedAt',
});

db.version(2)
  .stores({ pending: 'id', meta: 'key' })
  .upgrade(async (tx) => {
    // Words from before sync existed still need their first upload.
    const words = await tx.table<Word>('words').toArray();
    await tx.table<Pending>('pending').bulkPut(words.map((word) => ({ id: word.id, at: word.updatedAt })));
  });

db.version(3)
  .stores({ corrections: 'id, [language+createdAt]' })
  .upgrade(async (tx) => {
    // Pulled again from the start: corrections other devices made before this
    // one knew about them are behind its cursor.
    await tx.table<Meta>('meta').delete('cursor');
  });

db.version(4)
  .stores({ days: 'day' })
  .upgrade(async (tx) => {
    // As for corrections: days other devices practised are behind the cursor.
    await tx.table<Meta>('meta').delete('cursor');
  });
