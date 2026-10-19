import Dexie from 'dexie';
import { normalize } from '../domain/dictionary.ts';
import { progress } from '../domain/practice.ts';
import { type Draft, hasCounterpart, type Language, sexOf, type Word, wordFields } from '../domain/word.ts';
import { db } from './db.ts';
import { pageHidden, useLiveData } from './live.ts';
import { lookup } from './dictionary.ts';
import { requestSync } from './sync.ts';

/** Newest first. `undefined` while the first read is in flight. */
export function useWords(language: Language): Word[] | undefined {
  return useLiveData(
    () =>
      db.words
        .where('[language+createdAt]')
        .between([language, Dexie.minKey], [language, Dexie.maxKey])
        .reverse()
        .toArray(),
    [language],
  );
}

function newWord(language: Language, draft: Draft, now: number): Word {
  return { ...wordFields(language, draft), id: newId(), level: 1, streak: 0, createdAt: now, updatedAt: now };
}

export async function addWord(language: Language, draft: Draft): Promise<Word> {
  const word = newWord(language, draft, Date.now());
  await db.transaction('rw', db.words, db.pending, async () => {
    await db.words.add(word);
    await db.pending.put({ id: word.id, at: word.createdAt });
  });
  requestSync();
  return word;
}

/**
 * Adds several words at once, or none if one of them is not complete. They
 * show in the list in the order given: the list is newest first, so each one
 * is stamped a millisecond later than the one after it.
 */
export async function addWords(language: Language, drafts: Draft[]): Promise<Word[]> {
  const now = Date.now();
  const words = drafts.map((draft, index) => newWord(language, draft, now + drafts.length - 1 - index));
  await db.transaction('rw', db.words, db.pending, async () => {
    await db.words.bulkAdd(words);
    await db.pending.bulkPut(words.map((word) => ({ id: word.id, at: word.createdAt })));
  });
  requestSync();
  return words;
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

/** Moves a word up or down after a practice answer. Returns it as stored. */
export async function recordAnswer(word: Word, correct: boolean): Promise<Word> {
  const now = Date.now();
  const updated: Word = { ...word, ...progress(word, correct), updatedAt: now };
  await db.transaction('rw', db.words, db.pending, async () => {
    await db.words.update(word.id, { level: updated.level, streak: updated.streak, updatedAt: now });
    await db.pending.put({ id: word.id, at: now });
  });
  requestSync();
  return updated;
}

/** Archives a word, or brings it back. Returns it as stored. */
export async function setArchived(word: Word, archived: boolean): Promise<Word> {
  const now = Date.now();
  // Back from the archive it is a fresh start at the top: one miss and it drops.
  const updated: Word = { ...word, archived, streak: 0, updatedAt: now };
  await db.transaction('rw', db.words, db.pending, async () => {
    await db.words.update(word.id, { archived, streak: 0, updatedAt: now });
    await db.pending.put({ id: word.id, at: now });
  });
  requestSync();
  return updated;
}

let filling = false;

/**
 * Nouns saved before they could have a counterpart get one from the
 * dictionary: Lehrerin for a der Lehrer saved earlier. Only words that never
 * had the field are looked at, so one the person cleared stays clear. A word
 * the dictionary has no counterpart for is marked on this device alone, so it
 * is not looked up again and nothing about it syncs.
 */
export async function fillCounterparts(words: Word[]): Promise<void> {
  const missing = words.filter(
    (word) => word.counterpart === undefined && hasCounterpart(word.language, word.type) && sexOf(word.article) !== null,
  );
  if (filling || missing.length === 0) return;
  filling = true;
  try {
    for (const word of missing) {
      // Left for when the page is shown again (live.ts).
      if (pageHidden()) break;
      const found = (await lookup(word.language, word.term)).find(
        (suggestion) =>
          !suggestion.translated &&
          normalize(suggestion.term) === normalize(word.term) &&
          suggestion.type === 'noun' &&
          suggestion.article === word.article &&
          suggestion.counterpart,
      );
      const counterpart = found?.counterpart ?? null;
      const now = Date.now();
      await db.transaction('rw', db.words, db.pending, async () => {
        // Changed meanwhile, by an edit or a sync: left for the next round.
        const current = await db.words.get(word.id);
        if (!current || current.updatedAt !== word.updatedAt || current.counterpart !== undefined) return;
        if (counterpart === null) {
          await db.words.update(word.id, { counterpart: null });
          return;
        }
        await db.words.update(word.id, { counterpart, updatedAt: now });
        await db.pending.put({ id: word.id, at: now });
      });
    }
  } finally {
    filling = false;
  }
  requestSync();
}

/**
 * A v4 UUID. `crypto.randomUUID` only exists on secure origins, and the dev
 * server is reached over plain HTTP on the tailnet.
 */
export function newId(): string {
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
