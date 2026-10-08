import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { type Draft, type Language, type Word, wordFields } from '../domain/word.ts';
import { db } from './db.ts';
import { requestSync } from './sync.ts';

/** Newest first. `undefined` while the first read is in flight. */
export function useWords(language: Language): Word[] | undefined {
  return useLiveQuery(
    () =>
      db.words
        .where('[language+createdAt]')
        .between([language, Dexie.minKey], [language, Dexie.maxKey])
        .reverse()
        .toArray(),
    [language],
  );
}

export async function addWord(language: Language, draft: Draft): Promise<Word> {
  const now = Date.now();
  const word: Word = {
    ...wordFields(language, draft),
    id: newId(),
    level: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.words, db.pending, async () => {
    await db.words.add(word);
    await db.pending.put({ id: word.id, at: now });
  });
  requestSync();
  return word;
}

export async function updateWord(word: Word, draft: Draft): Promise<void> {
  const now = Date.now();
  const fields = wordFields(word.language, draft);
  await db.transaction('rw', db.words, db.pending, async () => {
    // A new picture has to be uploaded again.
    const photoKey = fields.photo === word.photo ? word.photoKey : null;
    await db.words.update(word.id, { ...fields, photoKey, updatedAt: now });
    await db.pending.put({ id: word.id, at: now });
  });
  requestSync();
}

/**
 * A v4 UUID. `crypto.randomUUID` only exists on secure origins, and the dev
 * server is reached over plain HTTP on the tailnet.
 */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function deleteWord(id: string): Promise<void> {
  await db.transaction('rw', db.words, db.pending, async () => {
    await db.words.delete(id);
    await db.pending.put({ id, at: Date.now() });
  });
  requestSync();
}
