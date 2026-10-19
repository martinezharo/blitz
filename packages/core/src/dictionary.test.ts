import { describe, expect, it } from 'vitest';
import { type DictEntry, fillDraft, normalize, type ReverseEntry, shardKey, suggest } from './dictionary.ts';
import { emptyDraft } from './word.ts';

const bank: DictEntry = {
  w: 'Bank',
  r: 1228,
  s: [
    { t: 'n', a: 'die', p: 'Bänke', g: ['bench', 'pew'] },
    { t: 'n', a: 'die', p: 'Banken', g: ['bank'] },
  ],
};
const bande: DictEntry = { w: 'Bande', r: 5000, s: [{ t: 'n', a: 'die', p: 'Banden', g: ['gang'] }] };
const ufer: ReverseEntry = { k: 'bank', w: 'Ufer', r: 6173, s: [{ t: 'n', a: 'das', p: 'Ufer', g: ['shore', 'bank'] }] };

describe('normalize and shardKey', () => {
  it('drops case, accents and punctuation', () => {
    expect(normalize('Über-Größe!')).toBe('uber grosse');
  });

  it('files a word under its first two letters', () => {
    expect(shardKey('bank')).toBe('ba');
    expect(shardKey('a')).toBe('a_');
    expect(shardKey('e mail')).toBe('e_');
  });
});

describe('suggest definitions', () => {
  const wiktionary: DictEntry = { w: 'Mund', r: 900, s: [{ t: 'n', a: 'der', p: 'Münder', g: ['mouth of a person'], d: 'An individual who has been granted personhood' }] };
  const written: DictEntry = { w: 'Mund', r: 900, s: [{ t: 'n', a: 'der', p: 'Münder', g: ['mouth'], d: 'An opening in the face used for eating and speaking', c: 1 }] };
  const english: DictEntry = { w: 'bat', r: 400, s: [{ t: 'n', d: 'Any flying mammal of the order Chiroptera' }] };

  it('does not offer the definition a German word borrowed from a translation', () => {
    expect(suggest('mund', [[wiktionary]])[0]).toMatchObject({ translation: 'mouth of a person', definition: null, curated: false });
  });

  it('offers the definition written for learners', () => {
    expect(suggest('mund', [[written]])[0]).toMatchObject({ definition: 'An opening in the face used for eating and speaking', curated: true });
  });

  it('keeps the only definition an English meaning has', () => {
    expect(suggest('bat', [[english]])[0]).toMatchObject({ definition: 'Any flying mammal of the order Chiroptera', curated: false });
  });
});

describe('suggest', () => {
  it('needs two letters to go on', () => {
    expect(suggest('b', [[bank]])).toEqual([]);
  });

  it('offers every meaning of the exact word first, then the more common prefix matches', () => {
    const found = suggest('bank', [[bande, bank], [ufer]]);
    expect(found.map((s) => [s.term, s.translation])).toEqual([
      ['Bank', 'bench, pew'],
      ['Bank', 'bank'],
      ['Ufer', 'shore, bank'],
    ]);
    expect(found[2]?.translated).toBe(true);
  });

  it('matches without accents', () => {
    const uber: DictEntry = { w: 'über', r: 10, s: [{ t: 'o', d: 'over' }] };
    expect(suggest('uber', [[uber]]).map((s) => s.term)).toEqual(['über']);
  });

  it('offers only the first meaning of a word that merely starts like the query', () => {
    const found = suggest('ban', [[bank, bande]]);
    expect(found.map((s) => s.term)).toEqual(['Bank', 'Bande']);
  });

  it('lists a word once when two files agree on it', () => {
    const rev: ReverseEntry = { k: 'bank', w: 'Bank', r: 1228, s: [bank.s[1]!] };
    const found = suggest('bank', [[bank], [rev]]);
    expect(found).toHaveLength(2);
  });
});

describe('fillDraft', () => {
  const [, second] = suggest('bank', [[bank]]);

  it('fills an empty draft', () => {
    const draft = fillDraft('de', emptyDraft('Bank'), second!);
    expect(draft).toMatchObject({ type: 'noun', article: 'die', plural: 'Banken', translation: 'bank' });
  });

  it('keeps what was written', () => {
    const draft = fillDraft('de', { ...emptyDraft('Bank'), translation: 'sofa', plural: 'Bänke' }, second!);
    expect(draft).toMatchObject({ translation: 'sofa', plural: 'Bänke', article: 'die' });
  });

  it('fills the counterpart of a German noun', () => {
    const teacher: DictEntry = { w: 'Lehrer', r: 900, s: [{ t: 'n', a: 'der', p: 'Lehrer', f: 'Lehrerin', g: ['teacher'] }] };
    const [found] = suggest('lehrer', [[teacher]]);
    expect(fillDraft('de', emptyDraft('Lehrer'), found!).counterpart).toBe('Lehrerin');
    expect(fillDraft('de', { ...emptyDraft('Lehrer'), counterpart: 'Lehrende' }, found!).counterpart).toBe('Lehrende');
  });

  it('leaves a draft alone when it is another type of word', () => {
    const verb = { ...emptyDraft('Bank'), type: 'verb' as const };
    expect(fillDraft('de', verb, second!)).toBe(verb);
  });

  it('leaves out the translation in a language with none', () => {
    expect(fillDraft('en', emptyDraft('bank'), second!).translation).toBe('');
  });
});
