import { normalize, type Suggestion } from './dictionary.ts';
import type { ListId } from './lists-concepts.ts';
import type { Language, Word } from './word.ts';

export type { ListId };

/**
 * A ready-made list of words to import. Each word is a dictionary meaning, as
 * the new-word line would offer it: importing fills in a word exactly like
 * picking that meaning does (`fillDraft`). They are written out, so showing a
 * list and importing it needs neither the dictionary nor a network.
 */
export interface WordList {
  id: ListId;
  name: string;
  words: Record<Language, Suggestion[]>;
}

const keyOf = (term: string, article: string | null | undefined) => `${article ?? ''}|${normalize(term)}`;

/** The words of the list that the person already has, as the same word with the same article. */
export function knownWords(words: readonly Suggestion[], saved: readonly Word[]): Set<Suggestion> {
  const have = new Set(saved.map((word) => keyOf(word.term, word.article)));
  return new Set(words.filter((word) => have.has(keyOf(word.term, word.article))));
}
