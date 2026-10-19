import * as Crypto from 'expo-crypto';
import { type Draft, hasCounterpart, type Language, sexOf, type Word, wordFields } from '@blitz/core/word.ts';
import { normalize } from '@blitz/core/dictionary.ts';
import { progress } from '@blitz/core/practice.ts';
import { changed, db } from './db.ts';
import { lookup } from './dictionary.ts';
import { requestSync } from './sync.ts';

/** One row of the words table, as SQLite keeps it. */
interface Row {
  id: string;
  language: Language;
  type: Word['type'];
  term: string;
  article: string | null;
  plural: string | null;
  counterpart: string | null;
  translation: string | null;
  definition: string | null;
  photo: string | null;
  photoKey: string | null;
  level: number;
  streak: number;
  archived: number;
  createdAt: number;
  updatedAt: number;
}

const wordOf = (row: Row): Word => ({
  id: row.id,
  language: row.language,
  type: row.type,
  term: row.term,
  article: row.article,
  plural: row.plural,
  counterpart: row.counterpart,
  translation: row.translation,
  definition: row.definition,
  // A device keeps the picture as a file, not as bytes in a column.
  photo: row.photo,
  photoKey: row.photoKey,
  level: row.level,
  streak: row.streak,
  archived: row.archived === 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const save = (word: Word) => {
  db.runSync(
    `INSERT INTO words (id, language, type, term, article, plural, counterpart, translation, definition, photo, photoKey, level, streak, archived, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       language = excluded.language, type = excluded.type, term = excluded.term, article = excluded.article,
       plural = excluded.plural, counterpart = excluded.counterpart, translation = excluded.translation,
       definition = excluded.definition, photo = excluded.photo, photoKey = excluded.photoKey,
       level = excluded.level, streak = excluded.streak, archived = excluded.archived, updatedAt = excluded.updatedAt`,
    word.id,
    word.language,
    word.type,
    word.term,
    word.article,
    word.plural,
    word.counterpart ?? null,
    word.translation,
    word.definition,
    typeof word.photo === 'string' ? word.photo : null,
    word.photoKey ?? null,
    word.level,
    word.streak ?? 0,
    word.archived ? 1 : 0,
    word.createdAt,
    word.updatedAt,
  );
};

/** Every word of a language, newest first. */
export function listWords(language: Language): Word[] {
  return db
    .getAllSync<Row>('SELECT * FROM words WHERE language = ? ORDER BY createdAt DESC', language)
    .map(wordOf);
}

export function findWord(id: string): Word | null {
  const row = db.getFirstSync<Row>('SELECT * FROM words WHERE id = ?', id);
  return row ? wordOf(row) : null;
}

function newWord(language: Language, draft: Draft, now: number): Word {
  return { ...wordFields(language, draft), id: newId(), level: 1, streak: 0, createdAt: now, updatedAt: now };
}

const stamp = (word: Word) => db.runSync('INSERT INTO pending (id, at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at', word.id, word.updatedAt);

export function addWord(language: Language, draft: Draft): Word {
  const word = newWord(language, draft, Date.now());
  db.withTransactionSync(() => {
    save(word);
    stamp(word);
  });
  changed();
  requestSync();
  return word;
}

/**
 * Adds several words at once. They show in the list's own order: the list is
 * newest first, so each one is stamped a millisecond later than the one after.
 */
export function addWords(language: Language, drafts: Draft[]): Word[] {
  const now = Date.now();
  const words = drafts.map((draft, index) => newWord(language, draft, now + drafts.length - 1 - index));
  db.withTransactionSync(() => {
    for (const word of words) {
      save(word);
      stamp(word);
    }
  });
  changed();
  requestSync();
  return words;
}

export function updateWord(word: Word, draft: Draft): Word {
  const now = Date.now();
  const fields = wordFields(word.language, draft);
  // A new picture has to be uploaded again.
  const photoKey = fields.photo === word.photo ? word.photoKey : null;
  const updated: Word = { ...word, ...fields, photoKey, updatedAt: now };
  db.withTransactionSync(() => {
    save(updated);
    stamp(updated);
  });
  changed();
  requestSync();
  return updated;
}

/** Moves a word up or down after a practice answer. */
export function recordAnswer(word: Word, correct: boolean): Word {
  const now = Date.now();
  const updated: Word = { ...word, ...progress(word, correct), updatedAt: now };
  db.withTransactionSync(() => {
    save(updated);
    stamp(updated);
  });
  changed();
  requestSync();
  return updated;
}

/** Archives a word, or brings it back: a fresh start at the top. */
export function setArchived(word: Word, archived: boolean): Word {
  const now = Date.now();
  const updated: Word = { ...word, archived, streak: 0, updatedAt: now };
  db.withTransactionSync(() => {
    save(updated);
    stamp(updated);
  });
  changed();
  requestSync();
  return updated;
}

export function deleteWord(id: string): void {
  const now = Date.now();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM words WHERE id = ?', id);
    db.runSync('INSERT INTO pending (id, at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at', id, now);
  });
  changed();
  requestSync();
}

/** Only the sync layer writes a word it received, with the photo it fetched. */
export function keepRemote(word: Word): void {
  save(word);
}

/** The pending row a sync round has just sent, when the word was not written again meanwhile. */
export function settle(id: string, at: number): void {
  db.runSync('DELETE FROM pending WHERE id = ? AND at = ?', id, at);
}

export function pendingAt(id: string): number {
  return db.getFirstSync<{ at: number }>('SELECT at FROM pending WHERE id = ?', id)?.at ?? 0;
}

/**
 * Nouns saved before they could have a counterpart get one from the
 * dictionary: Lehrerin for a der Lehrer saved earlier. A word the dictionary
 * has no counterpart for is marked on this device alone.
 */
let filling = false;

export async function fillCounterparts(words: Word[]): Promise<void> {
  const missing = words.filter(
    (word) => word.counterpart === undefined && hasCounterpart(word.language, word.type) && sexOf(word.article) !== null,
  );
  if (filling || missing.length === 0) return;
  filling = true;
  try {
    for (const word of missing) {
      const found = (await lookup(word.language, word.term)).find(
        (suggestion) =>
          !suggestion.translated &&
          normalize(suggestion.term) === normalize(word.term) &&
          suggestion.type === 'noun' &&
          suggestion.article === word.article &&
          suggestion.counterpart,
      );
      const counterpart = found?.counterpart ?? null;
      const current = findWord(word.id);
      // Changed meanwhile, by an edit or a sync: left for the next round.
      if (!current || current.updatedAt !== word.updatedAt || current.counterpart !== undefined) continue;
      if (counterpart === null) {
        db.runSync('UPDATE words SET counterpart = NULL WHERE id = ?', word.id);
        continue;
      }
      const now = Date.now();
      db.withTransactionSync(() => {
        db.runSync('UPDATE words SET counterpart = ?, updatedAt = ? WHERE id = ?', counterpart, now, word.id);
        db.runSync('INSERT INTO pending (id, at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at', word.id, now);
      });
    }
  } finally {
    filling = false;
  }
  changed();
  requestSync();
}

/** A v4 UUID, from the device's own random source. */
export function newId(): string {
  const bytes = Crypto.getRandomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
