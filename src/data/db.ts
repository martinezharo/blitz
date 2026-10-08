import Dexie, { type EntityTable } from 'dexie';
import type { Word } from '../domain/word.ts';

/** A local write sync has not sent yet. `at` is the write's `updatedAt`. */
export interface Pending {
  id: string;
  at: number;
}

/** Sync bookkeeping: whose words these are and how far this device has pulled. */
export interface Meta {
  key: 'owner' | 'cursor';
  value: string | number;
}

/** The only place that knows words live in IndexedDB. */
export const db = new Dexie('blitz') as Dexie & {
  words: EntityTable<Word, 'id'>;
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
