import { describe, expect, it } from 'vitest';
import { buildReview, isRight, pickReview, REVIEW_SIZE, packTiles, reviewable, swapTile, tokenize } from './review.ts';
import type { Correction } from './writing.ts';

const noShuffle = () => 0.999;

const hund: Correction = {
  id: 'a',
  language: 'de',
  written: 'Ich habe ein Hund.',
  corrected: 'Ich habe einen Hund.',
  fixes: [{ wrong: 'ein', right: 'einen', why: 'Accusative', from: [9, 12], to: [9, 14] }],
  createdAt: 1,
  updatedAt: 1,
};

const were: Correction = {
  id: 'b',
  language: 'en',
  written: 'We was late and he go home.',
  corrected: 'We were late and he goes home.',
  fixes: [
    { wrong: 'was', right: 'were', why: 'Plural subject', from: [3, 6], to: [3, 7] },
    { wrong: 'go', right: 'goes', why: 'Third person', from: [19, 21], to: [20, 24] },
  ],
  createdAt: 2,
  updatedAt: 2,
};

describe('tokenize', () => {
  it('keeps the words and leaves the punctuation out', () => {
    expect(tokenize('Ich habe einen Hund.')).toEqual(['Ich', 'habe', 'einen', 'Hund']);
    expect(tokenize("Don't stop, ever-ready «ja»!")).toEqual(["Don't", 'stop', 'ever-ready', 'ja']);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('a German sentence with a translation', () => {
  const review = buildReview({ ...hund, translation: 'I have a dog.' }, [], noShuffle);

  it('is built from tiles: the words it needs and the ones written wrong', () => {
    expect(review.kind).toBe('tiles');
    if (review.kind !== 'tiles') return;
    expect(review.meaning).toBe('I have a dog.');
    expect(review.answer).toEqual(['Ich', 'habe', 'einen', 'Hund']);
    expect([...review.tiles].sort()).toEqual(['Hund', 'Ich', 'einen', 'ein', 'habe'].sort());
  });

  it('does not offer a word twice that the sentence needs once', () => {
    const swapped: Correction = {
      ...hund,
      written: 'Ich einen habe Hund.',
      fixes: [{ wrong: 'einen habe', right: 'habe einen', why: 'Word order', from: [4, 14], to: [4, 14] }],
      translation: 'I have a dog.',
    };
    const asked = buildReview(swapped, [], noShuffle);
    expect(asked.kind === 'tiles' && [...asked.tiles].sort()).toEqual([...tokenize(swapped.corrected)].sort());
  });

  it('is right only with the words in order', () => {
    if (review.kind !== 'tiles') throw new Error('tiles');
    expect(isRight(review, ['Ich', 'habe', 'einen', 'Hund'])).toBe(true);
    expect(isRight(review, ['Ich', 'habe', 'ein', 'Hund'])).toBe(false);
    expect(isRight(review, ['Ich', 'habe', 'einen'])).toBe(false);
    expect(isRight(review, ['Ich', 'einen', 'habe', 'Hund'])).toBe(false);
  });
});

describe('a sentence asked with gaps', () => {
  it('is what a German one without a translation, and every English one, becomes', () => {
    expect(buildReview(hund, [], noShuffle).kind).toBe('gaps');
    expect(buildReview({ ...hund, translation: '  ' }, [], noShuffle).kind).toBe('gaps');
    expect(buildReview(were, [], noShuffle).kind).toBe('gaps');
  });

  it('has a gap where each fix is, and the forms written wrong as tiles', () => {
    const review = buildReview(were, [], noShuffle);
    if (review.kind !== 'gaps') throw new Error('gaps');
    expect(review.parts).toEqual(['We ', { gap: 0 }, ' late and he ', { gap: 1 }, ' home.']);
    expect(review.answers).toEqual(['were', 'goes']);
    expect([...review.tiles].sort()).toEqual(['go', 'goes', 'was', 'were']);
  });

  it('is right only with every gap filled right', () => {
    const review = buildReview(were, [], noShuffle);
    expect(isRight(review, ['were', 'goes'])).toBe(true);
    expect(isRight(review, ['was', 'goes'])).toBe(false);
    expect(isRight(review, ['were', null])).toBe(false);
  });

  it('keeps a trailing gap and a word to take out', () => {
    const extra: Correction = {
      ...hund,
      id: 'c',
      language: 'en',
      written: 'I went to home',
      corrected: 'I went home',
      fixes: [{ wrong: 'to', right: '', why: 'No preposition', from: [7, 9], to: [7, 7] }],
    };
    const review = buildReview(extra, [], noShuffle);
    if (review.kind !== 'gaps') throw new Error('gaps');
    expect(review.parts).toEqual(['I went ', { gap: 0 }, 'home']);
    expect(review.answers).toEqual(['']);
    expect(review.tiles.sort()).toEqual(['', 'to']);
    expect(isRight(review, [''])).toBe(true);
  });

  it('borrows a couple of forms from other sentences of about the same size, never the answers', () => {
    const others = [hund, { ...were, id: 'd', language: 'en' as const }, { ...hund, id: 'e', fixes: [{ ...hund.fixes[0]!, wrong: 'dem', right: 'den' }] }];
    const review = buildReview({ ...hund, language: 'en', id: 'f' }, others, noShuffle);
    if (review.kind !== 'gaps') throw new Error('gaps');
    expect(review.tiles).toHaveLength(4);
    expect(new Set(review.tiles).size).toBe(4);
    expect(review.tiles).toEqual(expect.arrayContaining(['einen', 'ein']));
  });

  it('ignores fixes that do not fit in the sentence', () => {
    const broken: Correction = { ...hund, fixes: [{ ...hund.fixes[0]!, to: [9, 99] }] };
    expect(reviewable([broken])).toEqual([]);
  });
});

describe('picking a review', () => {
  const sentences = Array.from({ length: 14 }, (_, at): Correction => ({ ...hund, id: `s${at}`, archived: at % 7 === 0 || undefined }));

  it('leaves out archived sentences', () => {
    expect(reviewable(sentences)).toHaveLength(12);
    expect(pickReview(sentences).every((sentence) => !sentence.archived)).toBe(true);
  });

  it('asks about ten, each once', () => {
    const picked = pickReview(sentences, Math.random);
    expect(picked).toHaveLength(REVIEW_SIZE);
    expect(new Set(picked.map((sentence) => sentence.id)).size).toBe(REVIEW_SIZE);
    expect(pickReview(sentences.slice(0, 3))).toHaveLength(2);
  });
});

describe('swapTile', () => {
  it('puts a tile from the bank in an empty slot', () => {
    expect(swapTile([null, null], 2, null, 1)).toEqual([null, 2]);
  });

  it('trades places with the tile it is dropped on, when it comes from a slot', () => {
    expect(swapTile([0, 1], 0, 0, 1)).toEqual([1, 0]);
  });

  it('sends the tile it is dropped on back to the bank, when it comes from the bank', () => {
    expect(swapTile([0, null], 2, null, 0)).toEqual([2, null]);
  });

  it('takes a placed tile out when dropped off the slots, and moves it to an empty slot', () => {
    expect(swapTile([0, 1], 1, 1, null)).toEqual([0, null]);
    expect(swapTile([0, null], 0, 0, 1)).toEqual([null, 0]);
  });
});

describe('packTiles', () => {
  it('moves the placed tiles to the left, in order, keeping the number of slots', () => {
    expect(packTiles([null, 3, null, 1, null])).toEqual([3, 1, null, null, null]);
    expect(packTiles([2, 0])).toEqual([2, 0]);
    expect(packTiles([null, null])).toEqual([null, null]);
  });
});
