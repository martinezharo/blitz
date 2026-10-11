import type { Suggestion } from './dictionary.ts';
import { LIST_CONCEPTS } from './lists-concepts.ts';
import words from './lists-words.json' with { type: 'json' };
import type { WordList } from './lists.ts';
import type { WordType } from './word.ts';

/**
 * The ready-made lists: the meanings of lists-concepts.ts, as the curated
 * dictionary has them (lists-words.json, written by `pnpm lists`).
 */

interface Entry {
  term: string;
  type: string;
  article?: string;
  plural?: string;
  counterpart?: string;
  translation?: string;
  definition: string;
}

const suggestion = (entry: Entry): Suggestion => ({
  term: entry.term,
  type: entry.type as WordType,
  article: entry.article ?? null,
  plural: entry.plural ?? null,
  counterpart: entry.counterpart ?? null,
  translation: entry.translation ?? null,
  definition: entry.definition,
  translated: false,
  curated: true,
});

const written: Record<string, { de: Entry[]; en: Entry[] }> = words;

export const WORD_LISTS: readonly WordList[] = LIST_CONCEPTS.map((list) => ({
  id: list.id,
  name: list.name,
  words: { de: written[list.id]!.de.map(suggestion), en: written[list.id]!.en.map(suggestion) },
}));
