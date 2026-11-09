import { shuffle } from './practice.ts';
import type { Correction, Fix } from './writing.ts';

/**
 * Reviewing the grammar history. A sentence is asked in one of two ways, and
 * both are answered by tapping tiles made of the learner's own words:
 *
 * - `tiles`: the English meaning is shown and the German sentence is built
 *   from tiles, the words it needs mixed with the ones that were written wrong.
 *   Punctuation is not asked: only the words are placed.
 * - `gaps`: the corrected sentence with a gap where each fix was, to fill with
 *   the right form among the one that was written and a few others. It needs
 *   no translation, so it works in every language.
 *
 * There are no levels: a sentence stays until the learner archives or removes it.
 */

type Random = () => number;

/** The most sentences in one review. */
export const REVIEW_SIZE = 10;
/** Tiles other than the fixes' own that a gap may be offered with, at most. */
const EXTRA_TILES = 2;

/** A piece of the corrected sentence: plain text, or the gap of a fix (an index into `answers`). */
type Part = string | { gap: number };

export type Review = { correction: Correction } & (
  | { kind: 'tiles'; meaning: string; tiles: string[]; answer: string[] }
  | { kind: 'gaps'; parts: Part[]; tiles: string[]; answers: string[] }
);

/** The words of a text, without its punctuation: a full stop or a comma is never a tile to place. */
export function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

/** The fixes whose place in the corrected sentence is usable: in order and apart. */
function placed(correction: Correction): Fix[] {
  const out: Fix[] = [];
  let at = 0;
  for (const fix of [...correction.fixes].sort((a, b) => a.to[0] - b.to[0])) {
    if (fix.to[0] < at || fix.to[1] > correction.corrected.length) continue;
    out.push(fix);
    at = fix.to[1];
  }
  return out;
}

/** The sentences a review may ask: those still being learned. */
export function reviewable(corrections: readonly Correction[]): Correction[] {
  return corrections.filter((correction) => !correction.archived && placed(correction).length > 0);
}

/** Up to a lesson's worth of them, chosen at random. */
export function pickReview(corrections: readonly Correction[], random: Random = Math.random): Correction[] {
  return shuffle(reviewable(corrections), random).slice(0, REVIEW_SIZE);
}

function tilesFor(correction: Correction, meaning: string, random: Random): Review {
  const answer = tokenize(correction.corrected);
  const spare = [...answer];
  // Only what is not needed already: a word written in the wrong place has its tile.
  const wrong = correction.fixes.flatMap((fix) => tokenize(fix.wrong)).filter((token) => {
    const at = spare.indexOf(token);
    if (at >= 0) {
      spare.splice(at, 1);
      return false;
    }
    return true;
  });
  return { kind: 'tiles', correction, meaning, tiles: shuffle([...answer, ...wrong], random), answer };
}

function gapsFor(correction: Correction, others: readonly Correction[], random: Random): Review {
  const fixes = placed(correction);
  const parts: Part[] = [];
  let at = 0;
  fixes.forEach((fix, gap) => {
    if (fix.to[0] > at) parts.push(correction.corrected.slice(at, fix.to[0]));
    parts.push({ gap });
    at = fix.to[1];
  });
  if (at < correction.corrected.length) parts.push(correction.corrected.slice(at));

  const answers = fixes.map((fix) => fix.right);
  const offered = new Set(answers);
  const tiles = [...answers];
  for (const fix of fixes) {
    if (!offered.has(fix.wrong)) {
      offered.add(fix.wrong);
      tiles.push(fix.wrong);
    }
  }
  // A few forms from other sentences, of about the same size, so it is not a coin toss.
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const size = Math.max(...fixes.map((fix) => words(fix.right)));
  const pool = shuffle(
    [...new Set(others.flatMap((other) => other.fixes.flatMap((fix) => [fix.right, fix.wrong])))].filter(
      (form) => form !== '' && words(form) === size && !offered.has(form),
    ),
    random,
  );
  for (const form of pool.slice(0, EXTRA_TILES)) tiles.push(form);
  return { kind: 'gaps', correction, parts, tiles: shuffle(tiles, random), answers };
}

/**
 * The question for a sentence. `others` are the rest of the history, a source
 * of extra tiles. A sentence with a translation is built from tiles.
 */
export function buildReview(correction: Correction, others: readonly Correction[], random: Random = Math.random): Review {
  const meaning = correction.translation?.trim();
  if (correction.language === 'de' && meaning) return tilesFor(correction, meaning, random);
  return gapsFor(correction, others.filter((other) => other.id !== correction.id), random);
}

/** The placed tiles of a sentence, in order and with no empty slot between them. As long as the slots, so it says nothing of the answer. */
export function packTiles(slots: readonly (number | null)[]): (number | null)[] {
  const placed = slots.filter((tile) => tile !== null);
  return [...placed, ...slots.slice(placed.length).map(() => null)];
}

/**
 * Where every tile ends up when `tile` is dropped on slot `to`, coming from
 * slot `from` (null: from the bank). A tile already there trades places with
 * it, or goes back to the bank when the new one came from there. Dropped on no
 * slot (`to` null), a placed tile is taken out.
 */
export function swapTile(slots: readonly (number | null)[], tile: number, from: number | null, to: number | null): (number | null)[] {
  const next = [...slots];
  if (from !== null) next[from] = null;
  if (to === null) return next;
  const taken = next[to] ?? null;
  next[to] = tile;
  if (taken !== null && from !== null) next[from] = taken;
  return next;
}

/** What the learner put together: for tiles, the words in order; for gaps, the form in each gap (null while empty). */
export type Attempt = (string | null)[];

export function isRight(review: Review, attempt: Attempt): boolean {
  const expected = review.kind === 'tiles' ? review.answer : review.answers;
  return attempt.length === expected.length && expected.every((piece, at) => attempt[at] === piece);
}
