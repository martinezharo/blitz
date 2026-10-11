import type { Language } from './word.ts';

/**
 * Free writing: the learner writes in the language of the space, a model
 * marks what is wrong, and this file turns its answer into marks on the text.
 * Shared by the browser and the Worker, so the answer has one shape.
 */

/** The most a text sent to be checked may hold. */
export const MAX_TEXT = 1500;
/** The most mistakes kept from one check. */
export const MAX_MISTAKES = 40;

export type MistakeKind = 'spelling' | 'grammar';

/** One mistake, as the model reports it: a piece of the text and what it should be. */
export interface Mistake {
  kind: MistakeKind;
  /** Exactly as it is in the text. */
  wrong: string;
  right: string;
  /** Spelling only: the corrected word as a dictionary lists it, to save it. */
  word: string | null;
  /** A short explanation in English. */
  why: string;
}

/** What the model made of the text. */
export type Verdict = 'de' | 'en' | 'other' | 'nonsense';

export interface CheckResult {
  /** The language the text is in, or why it could not be checked. */
  language: Verdict;
  mistakes: Mistake[];
}

/** A mistake found in the text: `wrong` is `text.slice(start, end)`. */
export interface Mark extends Mistake {
  start: number;
  end: number;
}

const isLetter = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/**
 * Where `piece` stands in `text` as whole words, from `from` on: "ist" is not
 * found inside "Liste". -1 when it is not there.
 */
function findWhole(text: string, piece: string, from: number): number {
  for (let at = text.indexOf(piece, from); at !== -1; at = text.indexOf(piece, at + 1)) {
    const before = isLetter(piece[0]) && isLetter(text[at - 1]);
    const after = isLetter(piece.at(-1)) && isLetter(text[at + piece.length]);
    if (!before && !after) return at;
  }
  return -1;
}

/**
 * The model's answer for `text`, checked: mistakes it reports in words the
 * text does not have, that change nothing, or that overlap one already found
 * are dropped, so nothing is ever marked that is not there. They are found in
 * order, so a word written wrong twice is marked twice.
 */
export function markMistakes(text: string, answer: unknown): { language: Verdict; marks: Mark[] } {
  const value = (typeof answer === 'object' && answer !== null ? answer : {}) as Record<string, unknown>;
  const language: Verdict = ['de', 'en', 'other', 'nonsense'].includes(value.language as string) ? (value.language as Verdict) : 'nonsense';
  const marks: Mark[] = [];
  let cursor = 0;
  for (const item of Array.isArray(value.mistakes) ? value.mistakes : []) {
    if (marks.length === MAX_MISTAKES) break;
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    // Kept as written: it has to match the text character for character.
    const wrong = typeof raw.wrong === 'string' ? raw.wrong.trim() : '';
    const right = clean(raw.right, 200);
    if (!wrong || wrong.length > 200 || wrong === right) continue;
    const kind: MistakeKind = raw.kind === 'spelling' || raw.type === 'spelling' ? 'spelling' : 'grammar';
    let start = findWhole(text, wrong, cursor);
    if (start === -1) start = findWhole(text, wrong, 0);
    if (start === -1) continue;
    const end = start + wrong.length;
    if (marks.some((mark) => start < mark.end && end > mark.start)) continue;
    // Only a single word is a word to save; anything longer is a phrase.
    const word = kind === 'spelling' ? clean(raw.word, 60) || right : '';
    marks.push({
      kind,
      wrong,
      right,
      word: kind === 'spelling' && /^[\p{L}'-]+$/u.test(word) ? word : null,
      why: clean(raw.why, 200),
      start,
      end,
    });
    cursor = end;
  }
  marks.sort((a, b) => a.start - b.start);
  return { language, marks };
}

/** The text cut into plain runs and marked ones, in order, to draw it. */
export function segments(text: string, marks: readonly Mark[]): { text: string; mark: Mark | null }[] {
  const out: { text: string; mark: Mark | null }[] = [];
  let at = 0;
  for (const mark of marks) {
    if (mark.start > at) out.push({ text: text.slice(at, mark.start), mark: null });
    out.push({ text: text.slice(mark.start, mark.end), mark });
    at = mark.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: null });
  return out;
}

/** A fixed piece of a sentence: where it was in the written one, and where its fix is in the corrected one. */
export interface Fix {
  wrong: string;
  right: string;
  why: string;
  /** [start, end] in `written`. */
  from: [number, number];
  /** [start, end] in `corrected`. */
  to: [number, number];
}

/** A sentence with grammar mistakes, as the history keeps it. */
export interface SentenceFix {
  written: string;
  corrected: string;
  /** The grammar fixes. Spelling is corrected in `corrected` too, but not listed. */
  fixes: Fix[];
}

/** Where each sentence of the text starts and ends: up to a . ! ? or a line break, and the space after. */
function sentences(text: string): [number, number][] {
  const out: [number, number][] = [];
  const pattern = /[^.!?\n]*(?:[.!?]+["'»“”)]*|\n|$)/g;
  for (const match of text.matchAll(pattern)) {
    if (match[0] === '') {
      if (match.index >= text.length) break;
      continue;
    }
    out.push([match.index, match.index + match[0].length]);
  }
  return out;
}

/**
 * The sentences that have a grammar mistake, each as it was written and as it
 * should be, with every mistake in it fixed. Spelling mistakes alone are not
 * worth keeping: their words can be saved instead.
 */
export function sentenceFixes(text: string, marks: readonly Mark[]): SentenceFix[] {
  const out: SentenceFix[] = [];
  for (const [start, end] of sentences(text)) {
    const inside = marks.filter((mark) => mark.start >= start && mark.end <= end);
    if (!inside.some((mark) => mark.kind === 'grammar')) continue;
    // Trimmed, and the offsets moved with it.
    const lead = text.slice(start, end).search(/\S/);
    const from = start + Math.max(lead, 0);
    const written = text.slice(from, end).trimEnd();
    let corrected = '';
    let at = 0;
    const fixes: Fix[] = [];
    for (const mark of inside) {
      const markStart = mark.start - from;
      const markEnd = mark.end - from;
      corrected += written.slice(at, markStart);
      const toStart = corrected.length;
      corrected += mark.right;
      at = markEnd;
      if (mark.kind === 'grammar') {
        fixes.push({ wrong: mark.wrong, right: mark.right, why: mark.why, from: [markStart, markEnd], to: [toStart, corrected.length] });
      }
    }
    corrected += written.slice(at);
    out.push({ written, corrected, fixes });
  }
  return out;
}


/** A sentence kept in the grammar history of a language. */
export interface Correction extends SentenceFix {
  id: string;
  language: Language;
  createdAt: number;
  updatedAt: number;
}
