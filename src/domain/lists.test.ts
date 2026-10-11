import { describe, expect, it } from 'vitest';
import { fillDraft } from './dictionary.ts';
import { LIST_CONCEPTS } from './lists-concepts.ts';
import { WORD_LISTS } from './lists-catalogue.ts';
import { knownWords } from './lists.ts';
import { draftProblems, emptyDraft, LANGUAGE_ORDER, type Language, wordFields, type Word } from './word.ts';

const filled = (language: Language, index: number, list = 'jobs') => {
  const word = WORD_LISTS.find((candidate) => candidate.id === list)!.words[language][index]!;
  return fillDraft(language, emptyDraft(word.term), word);
};

describe('the lists', () => {
  it('hold every meaning of their concepts, in both languages', () => {
    for (const list of LIST_CONCEPTS) {
      const words = WORD_LISTS.find((candidate) => candidate.id === list.id)!.words;
      for (const language of LANGUAGE_ORDER) expect(words[language], `${list.id} in ${language}`).toHaveLength(list.concepts.length);
    }
  });

  it('give every word everything it needs to be saved as it is', () => {
    for (const list of WORD_LISTS) {
      for (const language of LANGUAGE_ORDER) {
        for (const word of list.words[language]) {
          const draft = fillDraft(language, emptyDraft(word.term), word);
          expect(draftProblems(language, draft), `${list.id}: ${word.term} in ${language}`).toEqual([]);
          expect(wordFields(language, draft).definition, `${word.term} in ${language}`).not.toBeNull();
        }
      }
    }
  });

  it('save a word as picking it from the dictionary would', () => {
    // The sheet is filled by fillDraft; a list word goes through the same.
    expect(wordFields('de', filled('de', 0))).toMatchObject({ term: 'Lehrer', article: 'der', plural: 'Lehrer', counterpart: 'Lehrerin', translation: 'teacher' });
    expect(wordFields('en', filled('en', 0))).toMatchObject({ term: 'teacher', article: null, translation: null });
  });

  it('have no word twice, and no list twice', () => {
    for (const list of WORD_LISTS) {
      for (const language of LANGUAGE_ORDER) {
        const keys = list.words[language].map((word) => `${word.article ?? ''} ${word.term} ${word.type}`);
        expect(new Set(keys).size, `${list.id} in ${language}`).toBe(keys.length);
      }
    }
    expect(new Set(WORD_LISTS.map((list) => list.id)).size).toBe(WORD_LISTS.length);
  });

  it('give every German noun an article, and every list its words in the concepts order', () => {
    for (const list of WORD_LISTS) {
      for (const word of list.words.de.filter((word) => word.type === 'noun')) expect(word.article, word.term).toMatch(/^(der|die|das)$/);
    }
    const jobs = LIST_CONCEPTS.find((list) => list.id === 'jobs')!;
    expect(WORD_LISTS.find((list) => list.id === 'jobs')!.words.de.map((word) => word.term)).toEqual(jobs.concepts.map((concept) => concept.de));
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
