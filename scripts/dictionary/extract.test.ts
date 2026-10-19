import { describe, expect, it } from 'vitest';
import type { DictEntry } from '@blitz/core/dictionary.ts';
import { clip, englishDefinition, englishSenses, germanMeaning, germanSense, isLearnable, reverseKeys, type RawEntry } from './extract.ts';

const noun = (extra: Partial<RawEntry> = {}): RawEntry => ({
  word: 'Bank',
  pos: 'noun',
  forms: [
    { form: 'Banken', tags: ['plural'] },
    { form: 'Bank', tags: ['nominative', 'singular'], source: 'declension' },
  ],
  senses: [{ glosses: ['bank (financial institution)'], tags: ['feminine'] }],
  ...extra,
});

describe('germanSense', () => {
  it('reads article, plural and translation of a noun', () => {
    expect(germanSense(noun())).toEqual({ term: 'Bank', sense: { t: 'n', a: 'die', p: 'Banken', g: ['bank'] } });
  });

  it('falls back to the declension for the plural', () => {
    const entry = noun({ forms: [{ form: 'Bänke', tags: ['nominative', 'plural'], source: 'declension' }] });
    expect(germanSense(entry)?.sense.p).toBe('Bänke');
  });

  it('skips inflected forms, proper names and tagged-away meanings', () => {
    expect(germanSense(noun({ senses: [{ glosses: ['plural of Bank'], tags: ['form-of'] }] }))).toBeNull();
    expect(germanSense(noun({ pos: 'name' }))).toBeNull();
    expect(germanSense(noun({ senses: [{ glosses: ['old bank'], tags: ['obsolete'] }] }))).toBeNull();
    expect(germanSense(noun({ senses: [{ glosses: ['genitive singular of Bank'] }] }))).toBeNull();
  });

  it('reads the form for the other sex of a masculine or feminine noun', () => {
    const teacher = noun({
      word: 'Lehrer',
      forms: [
        { form: 'Lehrer', tags: ['plural'] },
        { form: 'Lehrerin', tags: ['feminine'] },
      ],
      senses: [{ glosses: ['teacher'], tags: ['masculine'] }],
    });
    expect(germanSense(teacher)?.sense).toMatchObject({ a: 'der', f: 'Lehrerin' });
    expect(germanSense({ ...teacher, senses: [{ glosses: ['teacher'], tags: ['neuter'] }] })?.sense.f).toBeUndefined();
  });

  it('keeps agent nouns and female equivalents, by the meaning given beside', () => {
    const agent = noun({
      word: 'Fahrer',
      senses: [
        {
          glosses: ['agent noun of fahren; driver (person)'],
          tags: ['agent', 'form-of', 'masculine'],
          form_of: [{ word: 'fahren', extra: 'driver (person)' }],
        },
      ],
    });
    expect(germanSense(agent)?.sense).toMatchObject({ a: 'der', g: ['driver'] });
    const female = noun({
      word: 'Lehrerin',
      senses: [
        {
          glosses: ['female equivalent of Lehrer (“teacher”)'],
          tags: ['feminine', 'form-of'],
          form_of: [{ word: 'Lehrer', extra: 'teacher' }],
        },
      ],
    });
    expect(germanSense(female)?.sense).toMatchObject({ a: 'die', g: ['teacher'] });
    expect(germanSense(noun({ senses: [{ glosses: ['agent noun of fahren'], tags: ['agent', 'form-of'], form_of: [{ word: 'fahren' }] }] }))).toBeNull();
  });

  it('gives no article or plural to a verb', () => {
    const verb: RawEntry = { word: 'laufen', pos: 'verb', senses: [{ glosses: ['to run'], tags: ['strong'] }] };
    expect(germanSense(verb)).toEqual({ term: 'laufen', sense: { t: 'v', g: ['to run'] } });
  });
});

describe('germanMeaning', () => {
  it('cuts descriptions down to the translations', () => {
    expect(germanMeaning(['to rave (to attend a rave)', 'to party'])).toEqual({ g: ['to rave', 'to party'] });
  });

  it('splits at commas and semicolons outside brackets', () => {
    expect(germanMeaning(['bench, seat (for two, or more); pew'])).toEqual({ g: ['bench', 'seat', 'pew'] });
  });

  it('keeps at most three, without duplicates', () => {
    expect(germanMeaning(['a, b, c, d', 'A']).g).toEqual(['a', 'b', 'c']);
  });

  it('falls back to a definition when nothing is short enough', () => {
    const long = 'a very long description of what the word is and how it is used by people';
    expect(germanMeaning([long])).toEqual({ g: [], d: long });
  });

  it('drops descriptions among the translations', () => {
    expect(germanMeaning(['one who teaches, teacher, instructor']).g).toEqual(['teacher', 'instructor']);
  });

  it('drops the tail of a sentence cut by a comma', () => {
    expect(germanMeaning(['vessel, or within a fissure']).g).toEqual(['vessel']);
  });
});

describe('englishSenses', () => {
  const entry: RawEntry = {
    word: 'bank',
    pos: 'noun',
    senses: [
      { glosses: ['An institution where one can place money.'] },
      { glosses: ['Alternative form of banc'] },
      { glosses: ['The land beside a river'] },
      { glosses: ['Old meaning'], tags: ['archaic'] },
    ],
  };

  it('keeps each usable definition, without the full stop', () => {
    expect(englishSenses(entry)?.senses).toEqual([
      { t: 'n', d: 'An institution where one can place money' },
      { t: 'n', d: 'The land beside a river' },
    ]);
  });

  it('skips proper nouns, which are capitalised', () => {
    expect(englishSenses({ ...entry, word: 'Bank' })).toBeNull();
  });

  it('keeps multi-word phrasal verbs only', () => {
    expect(englishSenses({ word: 'give up', pos: 'verb', senses: [{ glosses: ['to quit'] }] })).not.toBeNull();
    expect(englishSenses({ word: 'bank account', pos: 'noun', senses: [{ glosses: ['an account'] }] })).toBeNull();
  });
});

describe('englishDefinition', () => {
  const english = new Map<string, DictEntry>([
    ['bench', { w: 'bench', r: 1, s: [{ t: 'n', d: 'A long seat for several people' }] }],
    ['pay', { w: 'pay', r: 1, s: [{ t: 'n', d: 'Money given for work' }, { t: 'v', d: 'To give money in exchange for something' }] }],
    ['table', { w: 'table', r: 1, s: [{ t: 'n', d: 'Furniture with a flat top' }] }],
    ['desk', { w: 'desk', r: 1, s: [{ t: 'n', d: 'A table for writing at' }] }],
  ]);

  it('borrows the definition of the first known translation, of the same type', () => {
    expect(englishDefinition({ t: 'n', g: ['pew', 'bench'] }, english)).toBe('A long seat for several people');
    expect(englishDefinition({ t: 'v', g: ['to pay'] }, english)).toBe('To give money in exchange for something');
  });

  it('tries the main word of a longer translation before the next one', () => {
    expect(englishDefinition({ t: 'n', g: ['dining table', 'desk'] }, english)).toBe('Furniture with a flat top');
    expect(englishDefinition({ t: 'v', g: ['to pay out'] }, english)).toBe('To give money in exchange for something');
  });

  it('gives nothing when no translation is known as that type', () => {
    expect(englishDefinition({ t: 'v', g: ['bench'] }, english)).toBeUndefined();
    expect(englishDefinition({ t: 'n' }, english)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('knows a learnable term', () => {
    expect(isLearnable('Bank', false)).toBe(true);
    expect(isLearnable('e-mail', false)).toBe(true);
    expect(isLearnable('R2D2', false)).toBe(false);
    expect(isLearnable('give up', false)).toBe(false);
  });

  it('clips at a natural break', () => {
    expect(clip('short')).toBe('short');
    expect(clip(`${'word '.repeat(10)}; ${'more '.repeat(40)}`)).toMatch(/…$/);
  });

  it('keys a translation without its article or "to"', () => {
    expect(reverseKeys(['to run', 'the Bank', 'run'])).toEqual(['run', 'bank']);
  });
});
