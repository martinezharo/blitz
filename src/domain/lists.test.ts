import { describe, expect, it } from 'vitest';
import { knownWords, listDraft } from './lists.ts';
import { WORD_LISTS } from './lists-catalogue.ts';
import { draftProblems, LANGUAGE_ORDER, wordFields, type Word } from './word.ts';

describe('the lists', () => {
  it('give every word everything it needs to be saved as it is', () => {
    for (const list of WORD_LISTS) {
      for (const language of LANGUAGE_ORDER) {
        expect(list.words[language].length, `${list.id} in ${language}`).toBeGreaterThan(0);
        for (const word of list.words[language]) {
          expect(draftProblems(language, listDraft(word)), `${list.id}: ${word.term} in ${language}`).toEqual([]);
        }
      }
    }
  });

  it('save with the same fields as a word picked from the dictionary', () => {
    for (const list of WORD_LISTS) {
      for (const language of LANGUAGE_ORDER) {
        for (const word of list.words[language]) {
          const fields = wordFields(language, listDraft(word));
          expect(fields.definition, `${word.term} in ${language}`).not.toBeNull();
          if (language === 'de') expect(fields.translation, word.term).not.toBeNull();
          if (language === 'de' && word.type === 'noun' && list.id !== 'food' && list.id !== 'body') {
            expect(fields.counterpart, word.term).not.toBeNull();
          }
        }
      }
    }
  });

  it('have no word twice', () => {
    for (const list of WORD_LISTS) {
      for (const language of LANGUAGE_ORDER) {
        const keys = list.words[language].map((word) => `${word.article ?? ''} ${word.term}`);
        expect(new Set(keys).size, `${list.id} in ${language}`).toBe(keys.length);
      }
    }
  });

  it('give every German noun an article, and every list a different id', () => {
    for (const list of WORD_LISTS) {
      for (const word of list.words.de.filter((word) => word.type === 'noun')) {
        expect(word.article, word.term).toMatch(/^(der|die|das)$/);
      }
    }
    expect(new Set(WORD_LISTS.map((list) => list.id)).size).toBe(WORD_LISTS.length);
  });
});

describe('listDraft', () => {
  it('keeps the counterpart of a German noun and drops it for English', () => {
    const teacher = WORD_LISTS.find((list) => list.id === 'jobs')!.words.de[0]!;
    expect(wordFields('de', listDraft(teacher))).toMatchObject({ term: 'Lehrer', article: 'der', counterpart: 'Lehrerin' });
  });
});

describe('knownWords', () => {
  const food = WORD_LISTS.find((list) => list.id === 'food')!.words.de;
  const saved = (term: string, article: string | null) => ({ term, article }) as Word;

  it('finds the words already saved, ignoring case and accents', () => {
    expect(knownWords(food, [saved('apfel', 'der'), saved('Käse', 'der')])).toEqual(new Set([food[0], food[8]]));
  });

  it('does not take the same spelling with another article for the same word', () => {
    expect(knownWords(food, [saved('Apfel', 'die')]).size).toBe(0);
  });
});
