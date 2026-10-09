import { describe, expect, it } from 'vitest';
import { buildExercise, dropLetter, fillLetters, isCorrect, mastery, pickLesson, progress } from './practice.ts';
import type { Word } from './word.ts';

const word = (patch: Partial<Word> = {}): Word => ({
  id: 'bank',
  language: 'de',
  type: 'noun',
  term: 'Bank',
  article: 'die',
  plural: null,
  translation: 'bench',
  definition: null,
  photo: null,
  level: 1,
  streak: 0,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const others = ['Tisch', 'Stuhl', 'Haus', 'Auto', 'Baum', 'Hund', 'Katze', 'Buch', 'Lampe'].map((term) =>
  word({ id: term, term, article: 'der' }),
);

describe('mastery', () => {
  it('adds up levels out of every word at the top', () => {
    expect(mastery([{ level: 1 }, { level: 3 }, { level: 5 }])).toEqual({ points: 9, max: 15 });
  });

  it('counts words from before practice as level one', () => {
    expect(mastery([{ level: 0 }])).toEqual({ points: 1, max: 5 });
  });
});

describe('progress', () => {
  it('moves up after three right answers in a row', () => {
    expect(progress({ level: 2, streak: 1 }, true)).toEqual({ level: 2, streak: 2 });
    expect(progress({ level: 2, streak: 2 }, true)).toEqual({ level: 3, streak: 0 });
  });

  it('moves down one level on a miss, never below one', () => {
    expect(progress({ level: 3, streak: 2 }, false)).toEqual({ level: 2, streak: 0 });
    expect(progress({ level: 1, streak: 2 }, false)).toEqual({ level: 1, streak: 0 });
  });

  it('stays at the top until a miss drops it to four', () => {
    expect(progress({ level: 5, streak: 0 }, true)).toEqual({ level: 5, streak: 0 });
    expect(progress({ level: 5, streak: 0 }, false)).toEqual({ level: 4, streak: 0 });
  });

  it('treats words from before practice as level one', () => {
    expect(progress({ level: 0 }, true)).toEqual({ level: 1, streak: 1 });
  });
});

describe('pickLesson', () => {
  it('asks ten questions without repeating a word back to back', () => {
    const lesson = pickLesson([word({ id: 'a' }), word({ id: 'b' }), word({ id: 'c', level: 5 }), word({ id: 'd' })]);
    expect(lesson).toHaveLength(10);
    lesson.forEach((id, index) => expect(id).not.toBe(lesson[index - 1]));
  });

  it('asks fewer with only one word', () => {
    expect(pickLesson([word()])).toEqual(['bank', 'bank', 'bank']);
  });
});

describe('exercises', () => {
  const words = [word(), ...others];

  it('level one: four options with the article shown', () => {
    const exercise = buildExercise(words[0]!, words);
    expect(exercise.gender).toBe('shown');
    expect(exercise.answer).toMatchObject({ kind: 'choice' });
    if (exercise.answer.kind !== 'choice') return;
    expect(exercise.answer.options).toHaveLength(4);
    expect(exercise.answer.options).toContain('die Bank');
    expect(isCorrect(exercise, '', 'die Bank')).toBe(true);
    expect(isCorrect(exercise, '', 'der Tisch')).toBe(false);
  });

  it('level two: eight options and the article to pick', () => {
    const exercise = buildExercise(word({ level: 2 }), words);
    expect(exercise.gender).toBe('pick');
    expect(exercise.answer.kind === 'choice' && exercise.answer.options).toHaveLength(8);
    expect(isCorrect(exercise, 'die', 'Bank')).toBe(true);
    expect(isCorrect(exercise, 'der', 'Bank')).toBe(false);
  });

  it('level three: the letters left over, shuffled, with a third already in place', () => {
    const exercise = buildExercise(word({ level: 3, term: 'Bus stop', article: null }), words);
    expect(exercise.gender).toBeNull();
    const { answer } = exercise;
    if (answer.kind !== 'letters') throw new Error('expected letters');
    expect(answer.given.filter(Boolean)).toHaveLength(2);
    expect(answer.given[3]).toBe(false);
    const given = [...'Bus stop'].filter((_, index) => answer.given[index]);
    expect([...answer.tiles, ...given].sort()).toEqual([...'Busstop'].sort());
    const rest = [...'Bus stop'].filter((char, index) => char !== ' ' && !answer.given[index]);
    const filled = fillLetters('Bus stop', answer.given, rest);
    expect(filled).toBe('Busstop');
    expect(isCorrect(exercise, '', filled)).toBe(true);
  });

  it('level three: a one-letter word has nothing given', () => {
    const exercise = buildExercise(word({ level: 3, term: 'a', article: null }), words);
    expect(exercise.answer).toEqual({ kind: 'letters', tiles: ['a'], given: [false] });
  });

  it('level four: a quarter of the word given, the article written', () => {
    const exercise = buildExercise(word({ level: 4, term: 'Bahnhof', article: 'der' }), words);
    expect(exercise.gender).toBe('write');
    expect(exercise.answer).toEqual({ kind: 'write', hint: 'Ba' });
    expect(isCorrect(exercise, ' Der ', 'HNHOF')).toBe(true);
    expect(isCorrect(exercise, 'das', 'hnhof')).toBe(false);
  });

  it('level five: only the first letter', () => {
    const exercise = buildExercise(word({ level: 5, type: 'verb', term: 'laufen', article: null }), words);
    expect(exercise.answer).toEqual({ kind: 'write', hint: 'l' });
    expect(isCorrect(exercise, '', 'aufen')).toBe(true);
    expect(isCorrect(exercise, '', 'aufn')).toBe(false);
  });
});

describe('dropLetter', () => {
  it('fills a free slot', () => {
    expect(dropLetter([null, null, null], 2, null, 1)).toEqual([null, 2, null]);
  });

  it('slides letters in the way to the right', () => {
    expect(dropLetter([0, 1, null, null], 2, null, 0)).toEqual([2, 0, 1, null]);
  });

  it('slides them left when the right is full', () => {
    expect(dropLetter([null, 0, 1], 2, null, 2)).toEqual([0, 1, 2]);
  });

  it('moves a placed letter, closing nothing but making room', () => {
    expect(dropLetter([0, 1, 2], 2, 2, 0)).toEqual([2, 0, 1]);
    expect(dropLetter([0, 1, 2], 0, 0, 2)).toEqual([1, 2, 0]);
  });

  it('takes a letter out when dropped off the word', () => {
    expect(dropLetter([0, 1, 2], 1, 1, null)).toEqual([0, null, 2]);
  });
});
