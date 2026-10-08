import { describe, expect, it } from 'vitest';
import { type Draft, draftProblems, emptyDraft, wordFields, wordSummary, type Word } from './word.ts';

const noun: Draft = { ...emptyDraft('Bank'), type: 'noun', article: 'die', plural: 'Bänke', translation: 'bench' };

describe('draftProblems', () => {
  it('lists what is missing in form order', () => {
    expect(draftProblems('de', emptyDraft())).toEqual(['term', 'type', 'meaning']);
  });

  it('accepts German nouns without an article', () => {
    const country: Draft = { ...emptyDraft('Deutschland'), type: 'noun', translation: 'Germany' };
    expect(draftProblems('de', country)).toEqual([]);
    expect(wordFields('de', country).article).toBeNull();
  });

  it('does not ask English nouns for an article', () => {
    expect(draftProblems('en', { ...emptyDraft('bench'), type: 'noun', definition: 'A long seat' })).toEqual([]);
  });

  it('accepts any one meaning', () => {
    const verb: Draft = { ...emptyDraft('laufen'), type: 'verb' };
    expect(draftProblems('de', verb)).toEqual(['meaning']);
    expect(draftProblems('de', { ...verb, translation: 'to run' })).toEqual([]);
    expect(draftProblems('de', { ...verb, definition: 'Move fast on foot' })).toEqual([]);
    expect(draftProblems('de', { ...verb, photo: new Blob() })).toEqual([]);
  });

  it('ignores a translation where the language has none', () => {
    expect(draftProblems('en', { ...emptyDraft('run'), type: 'verb', translation: 'run' })).toEqual(['meaning']);
  });

  it('treats blank text as missing', () => {
    expect(draftProblems('de', { ...noun, term: '   ', translation: ' ' })).toEqual(['term', 'meaning']);
  });
});

describe('wordFields', () => {
  it('trims and collapses whitespace', () => {
    const fields = wordFields('de', { ...noun, term: '  Bank ', translation: 'park   bench ' });
    expect(fields.term).toBe('Bank');
    expect(fields.translation).toBe('park bench');
  });

  it('drops noun fields once the word is no longer a noun', () => {
    const fields = wordFields('de', { ...noun, type: 'other' });
    expect(fields.article).toBeNull();
    expect(fields.plural).toBeNull();
  });

  it('stores empty optional text as null', () => {
    expect(wordFields('de', { ...noun, plural: '  ' }).plural).toBeNull();
  });

  it('refuses an incomplete draft', () => {
    expect(() => wordFields('de', emptyDraft('Bank'))).toThrow();
  });
});

describe('wordSummary', () => {
  const word = { translation: 'bench', definition: 'A long seat', plural: 'Bänke' } as Word;

  it('prefers the translation and adds the plural', () => {
    expect(wordSummary(word)).toBe('bench · pl. Bänke');
  });

  it('falls back to the definition', () => {
    expect(wordSummary({ ...word, translation: null, plural: null })).toBe('A long seat');
  });
});
