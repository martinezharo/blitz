import { describe, expect, it } from 'vitest';
import {
  buildExercise,
  dropLetter,
  fillLetters,
  isCorrect,
  mastery,
  misplacedTiles,
  offersArchive,
  pickLesson,
  progress,
  STREAK_TO_ARCHIVE,
  tileForTyped,
} from './practice.ts';
import { FILLERS } from './fillers.ts';
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

  it('counts archived words as learned, whatever their level', () => {
    expect(mastery([{ level: 2, archived: true }, { level: 2 }])).toEqual({ points: 7, max: 10 });
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
    expect(progress({ level: 5, streak: 0 }, true)).toEqual({ level: 5, streak: 1 });
    expect(progress({ level: 5, streak: 4 }, false)).toEqual({ level: 4, streak: 0 });
  });

  it('stops counting just past the archive offer', () => {
    expect(progress({ level: 5, streak: STREAK_TO_ARCHIVE }, true)).toEqual({ level: 5, streak: STREAK_TO_ARCHIVE + 1 });
    expect(progress({ level: 5, streak: STREAK_TO_ARCHIVE + 1 }, true)).toEqual({ level: 5, streak: STREAK_TO_ARCHIVE + 1 });
  });

  it('starts counting from nothing on reaching the top', () => {
    expect(progress({ level: 4, streak: 2 }, true)).toEqual({ level: 5, streak: 0 });
  });

  it('treats words from before practice as level one', () => {
    expect(progress({ level: 0 }, true)).toEqual({ level: 1, streak: 1 });
  });
});

describe('offersArchive', () => {
  it('offers only on the answer that passes five right in a row at the top', () => {
    expect(offersArchive({ level: 5, streak: STREAK_TO_ARCHIVE - 1 })).toBe(false);
    expect(offersArchive({ level: 5, streak: STREAK_TO_ARCHIVE })).toBe(true);
    expect(offersArchive({ level: 5, streak: STREAK_TO_ARCHIVE + 1 })).toBe(false);
  });

  it('never offers below the top level', () => {
    expect(offersArchive({ level: 4, streak: STREAK_TO_ARCHIVE })).toBe(false);
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

  it('pads the options with common words while the list is short', () => {
    const exercise = buildExercise(word(), [word(), word({ id: 'tisch', term: 'Tisch', article: 'der' })]);
    if (exercise.answer.kind !== 'choice') throw new Error('Expected a choice');
    const options = exercise.answer.options;
    expect(options).toHaveLength(4);
    expect(options).toContain('die Bank');
    expect(options).toContain('der Tisch');
    expect(options.filter((option) => option === 'der Tisch')).toHaveLength(1);
    expect(isCorrect(exercise, '', 'die Bank')).toBe(true);
  });

  it('offers the words spelled most like the answer', () => {
    const near = ['Band', 'Tank', 'Banken'].map((term) => word({ id: term, term, article: 'der' }));
    for (let run = 0; run < 20; run++) {
      const exercise = buildExercise(word(), [word(), ...others, ...near]);
      if (exercise.answer.kind !== 'choice') throw new Error('Expected a choice');
      expect([...exercise.answer.options].sort()).toEqual(['der Band', 'der Banken', 'der Tank', 'die Bank']);
    }
  });

  it('pads with words of the same kind first', () => {
    const verb = word({ level: 2, type: 'verb', term: 'laufen', article: null });
    const exercise = buildExercise(verb, [verb]);
    if (exercise.answer.kind !== 'choice') throw new Error('Expected a choice');
    expect(exercise.answer.options).toHaveLength(8);
    const fillerVerbs = FILLERS.de.filter((filler) => filler.type === 'verb').map((filler) => filler.term);
    expect(exercise.answer.options.filter((option) => option !== 'laufen').every((option) => fillerVerbs.includes(option))).toBe(true);
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

  it('level three: a capital and a small letter swapped still count as right', () => {
    const exercise = buildExercise(word({ level: 3, term: 'Es tut mir leid', article: null }), words);
    expect(isCorrect(exercise, '', 'estutmirleid')).toBe(true);
    expect(isCorrect(exercise, '', 'esTutmirlEid')).toBe(true);
    expect(isCorrect(exercise, '', 'estutmirliad')).toBe(false);
  });

  it('marks the tiles that are not where the word has them, skipping given letters and spaces', () => {
    // "Bus stop" with B and p given leaves u, s, s, t, o to place.
    const given = [true, false, false, false, false, false, false, true];
    const tiles = ['u', 's', 's', 't', 'o'];
    expect(misplacedTiles('Bus stop', given, tiles, [0, 1, 2, 3, 4])).toEqual([]);
    expect(misplacedTiles('Bus stop', given, tiles, [1, 0, 2, 4, 3])).toEqual([1, 0, 4, 3]);
    expect(misplacedTiles('Bus stop', given, ['U', 'S', 's', 'T', 'o'], [0, 1, 2, 3, 4])).toEqual([]);
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

  describe('a word with a form for each sex', () => {
    const teacher = (patch: Partial<Word> = {}) =>
      word({ id: 'lehrer', term: 'Lehrer', article: 'der', counterpart: 'Lehrerin', translation: 'teacher', ...patch });
    // The first roll picks the clue, the second whether the counterpart is asked.
    const rolls = (...values: number[]) => () => values.shift() ?? 0;

    it('asks for the word itself half the time, saying which sex', () => {
      const exercise = buildExercise(teacher({ level: 4 }), words, rolls(0, 0.5));
      expect(exercise).toMatchObject({ term: 'Lehrer', article: 'der', sex: 'male' });
      expect(isCorrect(exercise, 'der', 'hrer')).toBe(true);
    });

    it('asks for the counterpart, with its article, the other half', () => {
      const exercise = buildExercise(teacher({ level: 4 }), words, rolls(0, 0.4));
      expect(exercise).toMatchObject({ term: 'Lehrerin', article: 'die', sex: 'female', answer: { hint: 'Le' } });
      expect(isCorrect(exercise, 'die', 'hrerin')).toBe(true);
      expect(isCorrect(exercise, 'der', 'hrerin')).toBe(false);
    });

    it('offers the other form as a wrong option', () => {
      const exercise = buildExercise(teacher(), words, rolls(0, 0.4));
      if (exercise.answer.kind !== 'choice') throw new Error('Expected a choice');
      expect(exercise.answer.options).toEqual(expect.arrayContaining(['die Lehrerin', 'der Lehrer']));
      expect(isCorrect(exercise, '', 'die Lehrerin')).toBe(true);
      expect(isCorrect(exercise, '', 'der Lehrer')).toBe(false);
    });

    it('spells out the counterpart in letter exercises', () => {
      const exercise = buildExercise(teacher({ level: 3 }), words, rolls(0, 0.4));
      expect(exercise.answer.kind === 'letters' && exercise.answer.given).toHaveLength('Lehrerin'.length);
      expect(isCorrect(exercise, 'die', 'lehrerin')).toBe(true);
    });

    it('never asks for the counterpart when the article does not say which sex', () => {
      for (const article of [null, 'das']) {
        const exercise = buildExercise(teacher({ article }), words, rolls(0, 0));
        expect(exercise).toMatchObject({ term: 'Lehrer', sex: null });
      }
    });
  });

  describe('an audio clue', () => {
    const top = (patch: Partial<Word> = {}) => word({ level: 5, term: 'Bahnhof', article: 'der', translation: 'station', ...patch });
    const rolls = (...values: number[]) => () => values.shift() ?? 0;

    it('is one of the top level clues when a voice is ready', () => {
      const exercise = buildExercise(top(), words, rolls(0), true);
      expect(exercise.clue).toEqual({ kind: 'audio' });
      expect(exercise.answer).toEqual({ kind: 'write', hint: 'B' });
      expect(isCorrect(exercise, 'der', 'ahnhof')).toBe(true);
    });

    it('leaves the other clues in the mix', () => {
      expect(buildExercise(top(), words, rolls(0.9), true).clue).toEqual({ kind: 'translation', text: 'station' });
    });

    it('is never asked without a voice', () => {
      expect(buildExercise(top(), words, rolls(0)).clue).toEqual({ kind: 'translation', text: 'station' });
    });

    it('is never asked below the top level', () => {
      expect(buildExercise(top({ level: 4 }), words, rolls(0), true).clue).toEqual({ kind: 'translation', text: 'station' });
    });
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

describe('tileForTyped', () => {
  const tiles = ['a', 'é', 'a', 'T'];

  it('finds a loose letter, ignoring case', () => {
    expect(tileForTyped(tiles, [null, null], 't')).toBe(3);
  });

  it('skips letters already placed', () => {
    expect(tileForTyped(tiles, [0, null], 'a')).toBe(2);
    expect(tileForTyped(tiles, [0, 2], 'a')).toBeNull();
  });

  it('takes a plain letter for an accented one, but prefers an exact match', () => {
    expect(tileForTyped(tiles, [], 'e')).toBe(1);
    expect(tileForTyped(['e', 'é'], [], 'é')).toBe(1);
  });

  it('ignores letters that are not there', () => {
    expect(tileForTyped(tiles, [], 'z')).toBeNull();
  });
});
