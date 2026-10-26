import Dexie from 'dexie';
import type { Language } from '../domain/word.ts';
import { type Correction, type Mark, MAX_TEXT, MAX_TRANSLATED, type SentenceFix, TRANSLATE_BATCH, type Verdict } from '../domain/writing.ts';
import { db } from './db.ts';
import { pageHidden, useLiveData } from './live.ts';
import { requestSync } from './sync.ts';
import { newId } from './words.ts';

/** Why a text came back unchecked. */
export type CheckFailure = 'signed-out' | 'too-long' | 'limit' | 'offline' | 'failed';

export type CheckOutcome = { ok: true; language: Verdict; marks: Mark[] } | { ok: false; failure: CheckFailure };

const GIVE_UP_AFTER = 45_000;

/** Sends the text to be checked in the language of the space. */
export async function checkText(language: Language, text: string): Promise<CheckOutcome> {
  if (text.length > MAX_TEXT) return { ok: false, failure: 'too-long' };
  if (!navigator.onLine) return { ok: false, failure: 'offline' };
  try {
    const response = await fetch('/api/correct', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, text }),
      signal: AbortSignal.timeout(GIVE_UP_AFTER),
    });
    if (response.status === 401) return { ok: false, failure: 'signed-out' };
    if (response.status === 413) return { ok: false, failure: 'too-long' };
    if (response.status === 429) return { ok: false, failure: 'limit' };
    if (!response.ok) return { ok: false, failure: 'failed' };
    const body = (await response.json()) as { language: Verdict; marks: Mark[] };
    return { ok: true, language: body.language, marks: body.marks };
  } catch {
    return { ok: false, failure: navigator.onLine ? 'failed' : 'offline' };
  }
}

/** The grammar history of a language, newest first. `undefined` while it loads. */
export function useCorrections(language: Language): Correction[] | undefined {
  return useLiveData(
    () =>
      db.corrections
        .where('[language+createdAt]')
        .between([language, Dexie.minKey], [language, Dexie.maxKey])
        .reverse()
        .toArray(),
    [language],
  );
}

/**
 * Keeps the sentences of a check in the history, in the order they were
 * written. A sentence already in it, from checking the same text again, is
 * not kept twice.
 */
export async function saveCorrections(language: Language, found: SentenceFix[]): Promise<void> {
  const known = new Set(
    await db.corrections
      .where('[language+createdAt]')
      .between([language, Dexie.minKey], [language, Dexie.maxKey])
      .toArray((corrections) => corrections.map((correction) => correction.written)),
  );
  const sentences = found.filter((sentence) => !known.has(sentence.written));
  if (sentences.length === 0) return;
  const now = Date.now();
  // Newest first in the history, so the first sentence gets the latest stamp.
  const corrections: Correction[] = sentences.map((sentence, index) => ({
    ...sentence,
    id: newId(),
    language,
    createdAt: now + sentences.length - 1 - index,
    updatedAt: now + sentences.length - 1 - index,
  }));
  await db.transaction('rw', db.corrections, db.pending, async () => {
    await db.corrections.bulkAdd(corrections);
    await db.pending.bulkPut(corrections.map((correction) => ({ id: correction.id, at: correction.updatedAt, kind: 'correction' as const })));
  });
  requestSync();
}

export async function deleteCorrection(id: string): Promise<void> {
  await db.transaction('rw', db.corrections, db.pending, async () => {
    await db.corrections.delete(id);
    await db.pending.put({ id, at: Date.now(), kind: 'correction' });
  });
  requestSync();
}

/** Puts a sentence away as learned, or brings it back into the review. */
export async function setCorrectionArchived(id: string, archived: boolean): Promise<void> {
  await db.transaction('rw', db.corrections, db.pending, async () => {
    const correction = await db.corrections.get(id);
    if (!correction) return;
    const { archived: _, ...rest } = correction;
    const now = Date.now();
    await db.corrections.put({ ...rest, ...(archived && { archived: true }), updatedAt: now });
    await db.pending.put({ id, at: now, kind: 'correction' });
  });
  requestSync();
}

/** Batches asked for in one go: a history of a hundred sentences is translated at once. */
const TRANSLATION_ROUNDS = 5;
let translating: Promise<void> | null = null;

async function translateSentences(language: Language, sentences: string[]): Promise<(string | null)[] | null> {
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, sentences }),
      signal: AbortSignal.timeout(GIVE_UP_AFTER),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { translations?: unknown };
    const list = body.translations;
    if (!Array.isArray(list) || list.length !== sentences.length) return null;
    return list.map((item) => (typeof item === 'string' && item.trim() ? item : null));
  } catch {
    return null;
  }
}

/**
 * Gives the sentences of the history their English meaning, a batch at a time,
 * so they can be asked from it. Only German has one. It stops quietly when
 * there is no connection, no account or no allowance left, and when a round
 * brings nothing: what is missing is tried again the next time. A page in the
 * background stays away from the database (see live.ts), before the request
 * and again once its answer is back.
 */
export function translateMissing(language: Language): Promise<void> {
  if (language !== 'de' || !navigator.onLine) return Promise.resolve();
  translating ??= (async () => {
    for (let round = 0; round < TRANSLATION_ROUNDS; round++) {
      if (pageHidden()) return;
      const missing = (
        await db.corrections
          .where('[language+createdAt]')
          .between([language, Dexie.minKey], [language, Dexie.maxKey])
          .reverse()
          .toArray()
      )
        .filter((correction) => correction.translation === undefined && !correction.archived && correction.corrected.length <= MAX_TRANSLATED)
        .slice(0, TRANSLATE_BATCH);
      if (missing.length === 0) return;
      const translations = await translateSentences(language, missing.map((correction) => correction.corrected));
      if (!translations || pageHidden()) return;
      let stored = 0;
      await db.transaction('rw', db.corrections, db.pending, async () => {
        for (const [at, correction] of missing.entries()) {
          const translation = translations[at];
          const current = await db.corrections.get(correction.id);
          // Deleted meanwhile, or translated on another device.
          if (!translation || !current || current.translation !== undefined) continue;
          const now = Date.now();
          await db.corrections.put({ ...current, translation, updatedAt: now });
          await db.pending.put({ id: current.id, at: now, kind: 'correction' });
          stored++;
        }
      });
      if (stored > 0) requestSync();
      else return;
    }
  })().finally(() => {
    translating = null;
  });
  return translating;
}

/** What is on the page: the text, and its marks once checked. */
export interface WritingDraft {
  text: string;
  /** Set once the text has been checked, and cleared as soon as it changes. */
  marks: Mark[] | null;
}

const draftKey = (language: Language) => `blitz.writing.${language}`;

/** The text being written in a language, kept on this device so it survives a reload. */
export function loadDraft(language: Language): WritingDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey(language)) ?? 'null') as WritingDraft | null;
    if (stored && typeof stored.text === 'string') return { text: stored.text, marks: Array.isArray(stored.marks) ? stored.marks : null };
  } catch {
    // Blocked or broken storage: start with a blank page.
  }
  return { text: '', marks: null };
}

export function storeDraft(language: Language, draft: WritingDraft): void {
  try {
    if (!draft.text) localStorage.removeItem(draftKey(language));
    else localStorage.setItem(draftKey(language), JSON.stringify(draft));
  } catch {
    // Not kept, but still on the page.
  }
}
