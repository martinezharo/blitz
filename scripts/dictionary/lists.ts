import { LIST_CONCEPTS, type ListId } from '../../src/domain/lists-concepts.ts';
import type { WordType } from '../../src/domain/word.ts';
import type { CuratedSense } from './curated.ts';

/**
 * A word of a list as the curated dictionary has it, with the empty fields left
 * out (src/domain/lists-words.json). It is what picking that meaning from the
 * dictionary would fill in.
 */
export interface ListEntry {
  term: string;
  type: WordType;
  article?: string;
  plural?: string;
  counterpart?: string;
  translation?: string;
  definition: string;
}

export type ListWords = Record<ListId, { de: ListEntry[]; en: ListEntry[] }>;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The meaning of the word that the list means: of its type and article, and with its translation when it has one. */
function pick(senses: readonly CuratedSense[] | undefined, type: WordType, article: string | null, translation: string | null) {
  const fitting = (senses ?? []).filter((sense) => sense.type === type && (article === null || sense.article === article));
  return fitting.find((sense) => translation && sense.translations.some((known) => same(known.replace(/^to /, ''), translation))) ?? fitting[0];
}

function entryOf(term: string, sense: CuratedSense): ListEntry {
  const entry: ListEntry = { term, type: sense.type, definition: sense.definition };
  if (sense.article) entry.article = sense.article;
  if (sense.plural) entry.plural = sense.plural;
  if (sense.counterpart) entry.counterpart = sense.counterpart;
  if (sense.translations.length > 0) entry.translation = sense.translations.join(', ');
  return entry;
}

/** Every list's words, from the curated dictionary, and the ones it does not have yet. */
export function listWords(german: ReadonlyMap<string, CuratedSense[]>, english: ReadonlyMap<string, CuratedSense[]>) {
  const words = {} as ListWords;
  const missing: string[] = [];
  for (const list of LIST_CONCEPTS) {
    words[list.id] = { de: [], en: [] };
    for (const concept of list.concepts) {
      const de = pick(german.get(concept.de), concept.type, concept.article ?? null, concept.en);
      const en = pick(english.get(concept.en), concept.type, null, null);
      if (de) words[list.id].de.push(entryOf(concept.de, de));
      else missing.push(`de ${concept.de}`);
      if (en) words[list.id].en.push(entryOf(concept.en, en));
      else missing.push(`en ${concept.en}`);
    }
  }
  return { words, missing };
}
