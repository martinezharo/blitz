import { normalize, type Suggestion } from './dictionary.ts';
import type { Language, Word, WordType } from './word.ts';

/**
 * Ready-made lists of words to import. A list is a file in data/lists; what the
 * app gets is made from it and the curated dictionary at build time
 * (scripts/dictionary/lists.ts): an index of the lists, small enough to load
 * whole, and one file per list, loaded when it is opened. Each word is a
 * dictionary meaning, as the new-word line would offer it, so importing fills a
 * word in exactly like picking that meaning does (`fillDraft`).
 */

/** The colours of a list's card, by name. */
export const LIST_TINTS = ['orange', 'red', 'blue', 'green'] as const;
export type ListTint = (typeof LIST_TINTS)[number];

/** One word of a list as it is stored, with the empty fields left out. */
export interface ListEntry {
  term: string;
  type: WordType;
  article?: string;
  plural?: string;
  /** The same noun for the other sex. German nouns for people only. */
  counterpart?: string;
  translation?: string;
  definition: string;
}

/** What a list holds in one language: enough to show its card and to know what you have of it. */
export interface ListSide {
  count: number;
  /** The first words, for the card. */
  sample: string[];
  /** `listKey` of every word. */
  keys: string[];
}

/** The line of a list in the index (public/lists/index.json). */
export interface ListSummary {
  id: string;
  name: string;
  tint: ListTint;
  /** The drawing of the card's icon, as Lucide's `iconNode`. */
  icon: unknown[];
  de: ListSide;
  en: ListSide;
}

/** The words of one list, in both languages (public/lists/<id>.json). */
export type ListWords = Record<Language, ListEntry[]>;

/** What tells one word of a list from another, and a saved word from a word of a list: the word and its article. */
export const listKey = (term: string, article: string | null | undefined) => `${article ?? ''}|${normalize(term)}`;

/** The entry of a list as the dictionary would have offered it. */
export function suggestionOf(entry: ListEntry): Suggestion {
  return {
    term: entry.term,
    type: entry.type,
    article: entry.article ?? null,
    plural: entry.plural ?? null,
    counterpart: entry.counterpart ?? null,
    translation: entry.translation ?? null,
    definition: entry.definition,
    translated: false,
    curated: true,
  };
}

/** Which of the keys of a list the person already has, as the same word with the same article. */
export function savedKeys(keys: readonly string[], saved: readonly Word[]): Set<string> {
  const have = new Set(saved.map((word) => listKey(word.term, word.article)));
  return new Set(keys.filter((key) => have.has(key)));
}

/** The words of the list that the person already has. */
export function knownWords(words: readonly Suggestion[], saved: readonly Word[]): Set<Suggestion> {
  const have = savedKeys(words.map((word) => listKey(word.term, word.article)), saved);
  return new Set(words.filter((word) => have.has(listKey(word.term, word.article))));
}
