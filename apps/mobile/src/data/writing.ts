import type { Language } from '@blitz/core/word.ts';
import { type Correction, type Mark, MAX_TEXT, type SentenceFix, type Verdict } from '@blitz/core/writing.ts';
import { api } from './api.ts';
import { changed, db, getJson, setJson } from './db.ts';
import { requestSync } from './sync.ts';
import { newId } from './words.ts';

/** Why a text came back unchecked. */
export type CheckFailure = 'signed-out' | 'too-long' | 'limit' | 'offline' | 'failed';

export type CheckOutcome = { ok: true; language: Verdict; marks: Mark[] } | { ok: false; failure: CheckFailure };

const GIVE_UP_AFTER = 45_000;

/** Sends the text to be checked in the language of the space. */
export async function checkText(language: Language, text: string): Promise<CheckOutcome> {
  if (text.length > MAX_TEXT) return { ok: false, failure: 'too-long' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GIVE_UP_AFTER);
  try {
    const response = await api('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, text }),
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: false, failure: 'signed-out' };
    if (response.status === 413) return { ok: false, failure: 'too-long' };
    if (response.status === 429) return { ok: false, failure: 'limit' };
    if (!response.ok) return { ok: false, failure: 'failed' };
    const body = (await response.json()) as { language: Verdict; marks: Mark[] };
    return { ok: true, language: body.language, marks: body.marks };
  } catch {
    return { ok: false, failure: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

interface CorrectionRow {
  id: string;
  language: Language;
  written: string;
  corrected: string;
  fixes: string;
  createdAt: number;
  updatedAt: number;
}

const correctionOf = (row: CorrectionRow): Correction => ({
  id: row.id,
  language: row.language,
  written: row.written,
  corrected: row.corrected,
  fixes: JSON.parse(row.fixes) as Correction['fixes'],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The grammar history of a language, newest first. */
export function listCorrections(language: Language): Correction[] {
  return db
    .getAllSync<CorrectionRow>('SELECT * FROM corrections WHERE language = ? ORDER BY createdAt DESC', language)
    .map(correctionOf);
}

/**
 * Keeps the sentences of a check in the history, in the order they were
 * written. A sentence already in it is not kept twice.
 */
export function saveCorrections(language: Language, found: SentenceFix[]): void {
  const known = new Set(listCorrections(language).map((correction) => correction.written));
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
  db.withTransactionSync(() => {
    for (const correction of corrections) {
      db.runSync(
        'INSERT INTO corrections (id, language, written, corrected, fixes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        correction.id,
        correction.language,
        correction.written,
        correction.corrected,
        JSON.stringify(correction.fixes),
        correction.createdAt,
        correction.updatedAt,
      );
      db.runSync('INSERT INTO pending (id, at, kind) VALUES (?, ?, ?)', correction.id, correction.updatedAt, 'correction');
    }
  });
  changed();
  requestSync();
}

export function deleteCorrection(id: string): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM corrections WHERE id = ?', id);
    db.runSync('INSERT INTO pending (id, at, kind) VALUES (?, ?, ?)', id, Date.now(), 'correction');
  });
  changed();
  requestSync();
}

/** What is on the page: the text, and its marks once checked. */
export interface WritingDraft {
  text: string;
  /** Set once the text has been checked, and cleared as soon as it changes. */
  marks: Mark[] | null;
}

const draftKey = (language: Language) => `writing.${language}`;

/** The text being written in a language, kept on this device. */
export function loadDraft(language: Language): WritingDraft {
  const stored = getJson<WritingDraft>(draftKey(language));
  if (stored && typeof stored.text === 'string') {
    return { text: stored.text, marks: Array.isArray(stored.marks) ? stored.marks : null };
  }
  return { text: '', marks: null };
}

export function storeDraft(language: Language, draft: WritingDraft): void {
  setJson(draftKey(language), draft.text ? draft : null);
}
