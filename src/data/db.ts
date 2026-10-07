import Dexie, { type EntityTable } from 'dexie';
import type { Word } from '../domain/word.ts';

/**
 * The only place that knows words live in IndexedDB. Sync will hang off this
 * later, which is why every word carries `updatedAt`.
 */
export const db = new Dexie('blitz') as Dexie & { words: EntityTable<Word, 'id'> };

db.version(1).stores({
  words: 'id, language, [language+createdAt], updatedAt',
});
