import { describe, expect, it } from 'vitest';
import { fillDraft } from './dictionary.ts';
import { type ListEntry, listKey, knownWords, savedKeys, suggestionOf } from './lists.ts';
import { draftProblems, emptyDraft, wordFields, type Word } from './word.ts';

const teacher: ListEntry = { term: 'Lehrer', type: 'noun', article: 'der', plural: 'Lehrer', counterpart: 'Lehrerin', translation: 'teacher', definition: 'A person who teaches in a school' };
const apple: ListEntry = { term: 'Apfel', type: 'noun', article: 'der', plural: 'Äpfel', translation: 'apple', definition: 'A round fruit with firm flesh and a small core' };
const saved = (term: string, article: string | null) => ({ term, article }) as Word;

describe('listKey', () => {
  it('tells words apart by their article, and ignores case and accents', () => {
    expect(listKey('Käse', 'der')).toBe(listKey('kase', 'der'));
    expect(listKey('Leiter', 'die')).not.toBe(listKey('Leiter', 'der'));
    expect(listKey('apple', null)).toBe(listKey('apple', undefined));
  });
});

describe('suggestionOf', () => {
  it('is what the dictionary would have offered, so a list word fills in like a picked one', () => {
    const suggestion = suggestionOf(teacher);
    expect(suggestion).toMatchObject({ term: 'Lehrer', article: 'der', plural: 'Lehrer', counterpart: 'Lehrerin', translation: 'teacher', curated: true });
    const draft = fillDraft('de', emptyDraft('Lehrer'), suggestion);
    expect(draftProblems('de', draft)).toEqual([]);
    expect(wordFields('de', draft)).toMatchObject({ term: 'Lehrer', article: 'der', counterpart: 'Lehrerin', translation: 'teacher', definition: teacher.definition });
  });

  it('gives an English word no article, translation or plural', () => {
    const english: ListEntry = { term: 'teacher', type: 'noun', definition: 'A person who teaches in a school' };
    expect(wordFields('en', fillDraft('en', emptyDraft('teacher'), suggestionOf(english)))).toMatchObject({ article: null, translation: null, plural: null });
  });
});

describe('what a person already has of a list', () => {
  it('finds the saved words by key, ignoring case and accents', () => {
    const keys = [listKey('Apfel', 'der'), listKey('Käse', 'der'), listKey('Brot', 'das')];
    expect(savedKeys(keys, [saved('apfel', 'der'), saved('Käse', 'der')])).toEqual(new Set([keys[0], keys[1]]));
  });

  it('does not take the same spelling with another article for the same word', () => {
    expect(savedKeys([listKey('Apfel', 'der')], [saved('Apfel', 'die')]).size).toBe(0);
  });

  it('finds the words of a loaded list', () => {
    const words = [suggestionOf(apple), suggestionOf(teacher)];
    expect(knownWords(words, [saved('Lehrer', 'der')])).toEqual(new Set([words[1]]));
  });
});
