import { type Draft, hasArticle, LANGUAGES, type Language, type WordType } from './word.ts';

/**
 * The dictionary is static JSON built from Wiktionary (see
 * scripts/build-dictionary.ts) and split into small files by the first two
 * letters of the word, so typing only ever downloads one or two of them.
 */

/** One-letter word types, to keep the files small. */
export type SenseType = 'n' | 'v' | 'j' | 'd' | 'o';

export const SENSE_TYPES: Record<SenseType, WordType> = {
  n: 'noun',
  v: 'verb',
  j: 'adjective',
  d: 'adverb',
  o: 'other',
};

/** One meaning of a word, as stored. */
export interface DictSense {
  t: SenseType;
  /** Article. German nouns only. */
  a?: string;
  /** Plural. Nouns only. */
  p?: string;
  /** Short English translations. German words only. */
  g?: string[];
  /** English definition. */
  d?: string;
}

/** A word and its meanings. `r` is how common it is: lower is more common. */
export interface DictEntry {
  w: string;
  r: number;
  s: DictSense[];
}

/** An entry in a reverse file: found by `k`, an English word that translates it. */
export interface ReverseEntry extends DictEntry {
  k: string;
}

/** Which folder of files holds each kind of lookup. */
export type DictKind = 'de' | 'de-rev' | 'en';

/** The kinds searched for a language: what is typed first, then the reverse. */
export const DICT_KINDS: Record<Language, DictKind[]> = {
  de: ['de', 'de-rev'],
  en: ['en'],
};

/** What a suggestion needs to fill in a new word. */
export interface Suggestion {
  term: string;
  type: WordType;
  article: string | null;
  plural: string | null;
  translation: string | null;
  definition: string | null;
  /** The word typed was its English translation, not the word itself. */
  translated: boolean;
}

/** Lowercase letters and digits only, no accents: what typing is compared on. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The file a word lives in: its first two letters, `_` standing for a space. */
export function shardKey(normalized: string): string {
  return normalized.slice(0, 2).padEnd(2, '_').replace(/ /g, '_');
}

/** The shortest thing worth looking up. */
export const MIN_QUERY = 2;

/** How many suggestions to offer. */
export const MAX_SUGGESTIONS = 6;

/** How many meanings of one word to offer when it is exactly what was typed. */
const EXACT_SENSES = 4;

interface Match {
  entry: DictEntry;
  sense: DictSense;
  /** 0: the word itself, 1: a translation of it. Plain hits come before translated ones. */
  via: 0 | 1;
  exact: boolean;
  /** 0 is the first meaning of its word. */
  position: number;
}

function matchesIn(entries: readonly DictEntry[], query: string, via: 0 | 1, key: (entry: DictEntry) => string): Match[] {
  const found: Match[] = [];
  for (const entry of entries) {
    const text = normalize(key(entry));
    if (!text.startsWith(query)) continue;
    const exact = text === query;
    // A word that is only the start of what was typed gets its first meaning
    // alone, so the list shows more words instead of one word's meanings.
    const senses = exact ? entry.s.slice(0, EXACT_SENSES) : entry.s.slice(0, 1);
    senses.forEach((sense, position) => found.push({ entry, sense, via, exact, position }));
  }
  return found;
}

function suggestionOf(match: Match): Suggestion {
  const { entry, sense } = match;
  return {
    term: entry.w,
    type: SENSE_TYPES[sense.t],
    article: sense.a ?? null,
    plural: sense.p ?? null,
    translation: sense.g?.join(', ') ?? null,
    definition: sense.d ?? null,
    translated: match.via === 1,
  };
}

/**
 * The best suggestions for what was typed, from the files of each kind
 * (`files[0]` holds the words themselves, `files[1]`, if any, their English
 * translations). Exact matches come first, then the more common words.
 */
export function suggest(typed: string, files: readonly (readonly DictEntry[])[]): Suggestion[] {
  const query = normalize(typed);
  if (query.length < MIN_QUERY) return [];

  const matches = [
    ...matchesIn(files[0] ?? [], query, 0, (entry) => entry.w),
    ...matchesIn(files[1] ?? [], query, 1, (entry) => (entry as ReverseEntry).k),
  ];
  matches.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      a.via - b.via ||
      a.entry.r - b.entry.r ||
      a.entry.w.localeCompare(b.entry.w) ||
      // Meanings of one word stay together, in the order Wiktionary gives them.
      a.position - b.position,
  );

  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const match of matches) {
    const suggestion = suggestionOf(match);
    const id = [suggestion.term, suggestion.type, suggestion.article, suggestion.definition ?? suggestion.translation].join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(suggestion);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/** The article and word, as they read in a list: "die Bank". */
export function suggestionTitle(language: Language, suggestion: Suggestion): string {
  const article = LANGUAGES[language].articles && suggestion.article;
  return article ? `${article} ${suggestion.term}` : suggestion.term;
}

/**
 * Fills whatever the draft has left empty from a suggestion, and nothing the
 * person already wrote or picked. A suggestion for another type of word than
 * the one picked is left alone.
 */
export function fillDraft(language: Language, draft: Draft, suggestion: Suggestion): Draft {
  if (draft.type && draft.type !== suggestion.type) return draft;
  return {
    ...draft,
    type: suggestion.type,
    article: draft.article ?? (hasArticle(language, suggestion.type) ? suggestion.article : null),
    plural: draft.plural || suggestion.plural || '',
    translation: draft.translation || (LANGUAGES[language].translated ? (suggestion.translation ?? '') : ''),
    definition: draft.definition || suggestion.definition || '',
  };
}
