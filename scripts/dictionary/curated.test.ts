import { describe, expect, it } from 'vitest';
import type { DictEntry } from '@blitz/core/dictionary.ts';
import { applyCurated, cleanSense, cleanWord, packSense, reverseEntriesOf, toDictSense, unpackSense, type CuratedSense } from './curated.ts';

const lock = {
  type: 'noun',
  article: 'das',
  plural: 'Schlösser',
  counterpart: null,
  translations: ['lock'],
  definition: 'A device that keeps a door or box shut until opened with a key',
};
const castle = { ...lock, translations: ['castle'], definition: 'A large, grand building where a ruler or noble may live' };

describe('cleanSense', () => {
  it('mends a full stop and stray spaces', () => {
    const cleaned = cleanSense('de', { ...lock, definition: '  A device that keeps a door shut.  ' });
    expect(cleaned).toMatchObject({ sense: { definition: 'A device that keeps a door shut' } });
  });

  it('rejects what a learner could not read', () => {
    expect(cleanSense('de', { ...lock, definition: 'x'.repeat(90) })).toHaveProperty('problem');
    expect(cleanSense('de', { ...lock, definition: 'A thing (of some kind)' })).toHaveProperty('problem');
    expect(cleanSense('de', { ...lock, definition: 'a device for locking' })).toHaveProperty('problem');
    expect(cleanSense('de', { ...lock, type: 'thing' })).toHaveProperty('problem');
    expect(cleanSense('de', { ...lock, article: 'le' })).toHaveProperty('problem');
  });

  it('asks a German meaning for translations, and an English one for none', () => {
    expect(cleanSense('de', { ...lock, translations: [] })).toHaveProperty('problem');
    expect(cleanSense('de', { ...lock, translations: ['a', 'b', 'c', 'd'] })).toHaveProperty('problem');
    expect(cleanSense('en', { ...lock, translations: ['lock'] })).toMatchObject({ sense: { translations: [] } });
  });

  it('drops the fields a type does not use', () => {
    const verb = cleanSense('de', { ...lock, type: 'verb', translations: ['to lock'] });
    expect(verb).toMatchObject({ sense: { article: null, plural: null, counterpart: null } });
    const english = cleanSense('en', { ...lock, translations: [] });
    expect(english).toMatchObject({ sense: { article: null, plural: null } });
  });

  it('keeps a counterpart only for der and die nouns', () => {
    const teacher = { ...lock, article: 'der', counterpart: 'Lehrerin' };
    expect(cleanSense('de', teacher)).toMatchObject({ sense: { counterpart: 'Lehrerin' } });
    expect(cleanSense('de', { ...teacher, article: 'das' })).toMatchObject({ sense: { counterpart: null } });
  });
});

describe('cleanWord', () => {
  it('takes a word with its meanings and drops repeats', () => {
    const cleaned = cleanWord('de', { term: 'Schloss', senses: [lock, castle, { ...lock }] });
    expect(cleaned).toMatchObject({ word: { term: 'Schloss' } });
    expect('word' in cleaned && cleaned.word.senses).toHaveLength(2);
  });

  it('gives up on a word when one meaning is bad', () => {
    expect(cleanWord('de', { term: 'Schloss', senses: [lock, { ...castle, definition: '' }] })).toHaveProperty('problems');
  });

  it('accepts a word with no meanings, and refuses more than four', () => {
    expect(cleanWord('en', { term: 'Paris', senses: [] })).toEqual({ word: { term: 'Paris', senses: [] } });
    const many = Array.from({ length: 5 }, (_, index) => ({ ...lock, definition: `Meaning number ${'x'.repeat(index + 1)}` }));
    expect(cleanWord('de', { term: 'Schloss', senses: many })).toHaveProperty('problems');
  });

  it('refuses something that is not a word', () => {
    expect(cleanWord('de', null)).toHaveProperty('problems');
    expect(cleanWord('de', { term: 'Schloss' })).toHaveProperty('problems');
  });
});

describe('toDictSense', () => {
  it('writes a German noun the way the dictionary does, marked as curated', () => {
    expect(toDictSense('de', lock as CuratedSense)).toEqual({ t: 'n', a: 'das', p: 'Schlösser', g: ['lock'], d: lock.definition, c: 1 });
  });

  it('takes the plural of the dictionary when the model gave none', () => {
    const noPlural = { ...lock, plural: null } as CuratedSense;
    expect(toDictSense('de', noPlural, [{ t: 'n', a: 'das', p: 'Schlösser' }])).toMatchObject({ p: 'Schlösser' });
    expect(toDictSense('de', noPlural, [{ t: 'n', a: 'die', p: 'Banken' }]).p).toBeUndefined();
  });

  it('gives an English meaning a type and a definition only', () => {
    const sense: CuratedSense = { type: 'verb', article: null, plural: null, counterpart: null, translations: [], definition: 'To move quickly on foot' };
    expect(toDictSense('en', sense)).toEqual({ t: 'v', d: 'To move quickly on foot', c: 1 });
  });
});

describe('applyCurated', () => {
  const entry: DictEntry = { w: 'Schloss', r: 1680, s: [{ t: 'n', a: 'das', p: 'Schlösser', g: ['lock', 'padlock', 'castle'], d: 'Something used for fastening' }] };

  it('replaces the meanings and keeps the word and its rank', () => {
    const next = applyCurated('de', entry, { term: 'Schloss', senses: [lock, castle] as CuratedSense[] });
    expect(next).toMatchObject({ w: 'Schloss', r: 1680 });
    expect(next.s.map((sense) => sense.g)).toEqual([['lock'], ['castle']]);
  });

  it('leaves a word the model gave nothing for as it was', () => {
    expect(applyCurated('de', entry, { term: 'Schloss', senses: [] })).toBe(entry);
  });
});

describe('reverseEntriesOf', () => {
  it('lists a word once per English word that names it, with the meanings that do', () => {
    const entry: DictEntry = {
      w: 'Schloss',
      r: 10,
      s: [
        { t: 'n', g: ['lock', 'padlock'], c: 1 },
        { t: 'n', g: ['castle', 'lock'], c: 1 },
      ],
    };
    const hits = reverseEntriesOf(entry, (key) => key !== 'padlock');
    expect(hits.map((hit) => hit.k).sort()).toEqual(['castle', 'lock']);
    expect(hits.find((hit) => hit.k === 'lock')!.s).toHaveLength(2);
  });
});

describe('packSense', () => {
  it('leaves out what is empty and puts it back', () => {
    const sense: CuratedSense = { type: 'verb', article: null, plural: null, counterpart: null, translations: ['to run'], definition: 'To move quickly on foot' };
    const packed = packSense(sense);
    expect(Object.keys(packed)).toEqual(['type', 'translations', 'definition']);
    expect(unpackSense(packed)).toEqual(sense);
  });
});
