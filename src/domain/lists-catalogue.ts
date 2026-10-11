import { LIST_CONCEPTS } from './lists-concepts.ts';
import definitions from './lists-definitions.json' with { type: 'json' };
import type { ListWord, WordList } from './lists.ts';
import type { Language } from './word.ts';

/**
 * The ready-made lists: the words of lists-concepts.ts with the definitions of
 * lists-definitions.json, which `pnpm lists` writes from the curated
 * dictionary, so a word imported from a list reads like one picked from it.
 * Both languages carry the English definition, and a German word its
 * translation too.
 */

const written: Record<Language, Record<string, string>> = definitions;

function definitionOf(language: Language, term: string, type: string): string {
  const definition = written[language][`${term}|${type}`];
  if (!definition) throw new Error(`No definition for ${term} (${type}) in lists-definitions.json: run pnpm lists`);
  return definition;
}

export const WORD_LISTS: readonly WordList[] = LIST_CONCEPTS.map((list) => ({
  id: list.id,
  name: list.name,
  words: {
    en: list.concepts.map((concept): ListWord => ({ type: concept.type, term: concept.en, definition: definitionOf('en', concept.en, concept.type) })),
    de: list.concepts.map((concept): ListWord => {
      const { de } = concept;
      const base = { type: concept.type, term: de.term, translation: 'translation' in concept && concept.translation ? concept.translation : concept.en };
      const definition = definitionOf('de', de.term, concept.type);
      if (concept.type === 'adjective') return { ...base, definition };
      return { ...base, article: concept.de.article, plural: concept.de.plural ?? undefined, counterpart: concept.de.counterpart, definition };
    }),
  },
}));
