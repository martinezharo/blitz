import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { type Draft, type Language, type Word, wordFields } from '../domain/word.ts';
import { db } from './db.ts';

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
  await db.words.add(word);
  return word;
}

export async function updateWord(word: Word, draft: Draft): Promise<void> {
  await db.words.update(word.id, { ...wordFields(word.language, draft), updatedAt: Date.now() });
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
  await db.words.delete(id);
}
