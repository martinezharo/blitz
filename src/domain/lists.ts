import { normalize } from './dictionary.ts';
import { type Draft, emptyDraft, type Language, type Word, type WordType } from './word.ts';

/**
 * A ready-made list of words to import. Its words are written out in full, so
 * showing a list and importing it needs neither the dictionary nor a network.
 */

/** One word of a list. A German word brings its translation, an English one its definition. */
export interface ListWord {
  type: WordType;
  term: string;
  article?: string;
  plural?: string;
  /** The same noun for the other sex. German nouns for people only. */
  counterpart?: string;
  translation?: string;
  definition?: string;
}

export type ListId = 'food' | 'colours' | 'body' | 'jobs';

export interface WordList {
  id: ListId;
  name: string;
  words: Record<Language, ListWord[]>;
}

/** What the sheet would hold for this word, ready to be saved as it is. */
export function listDraft(word: ListWord): Draft {
  return {
    ...emptyDraft(word.term),
    type: word.type,
    article: word.article ?? null,
    plural: word.plural ?? '',
    counterpart: word.counterpart ?? '',
    translation: word.translation ?? '',
    definition: word.definition ?? '',
  };
}

const keyOf = (term: string, article: string | null | undefined) => `${article ?? ''}|${normalize(term)}`;

/** The words of the list that the person already has, as the same word with the same article. */
export function knownWords(words: readonly ListWord[], saved: readonly Word[]): Set<ListWord> {
  const have = new Set(saved.map((word) => keyOf(word.term, word.article)));
  return new Set(words.filter((word) => have.has(keyOf(word.term, word.article))));
}
