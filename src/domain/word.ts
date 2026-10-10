/** Each language is its own space: its own list, its own practice. */
export type Language = 'de' | 'en';

export type WordType = 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';

export interface LanguageSpec {
  name: string;
  flag: string;
  /** Grammatical genders, as articles. Null when nouns carry none. */
  articles: readonly string[] | null;
  /** The app is in English, so an English word has no translation to ask for. */
  translated: boolean;
}

export const LANGUAGES: Record<Language, LanguageSpec> = {
  de: { name: 'German', flag: '🇩🇪', articles: ['der', 'die', 'das'], translated: true },
  en: { name: 'English', flag: '🇬🇧', articles: null, translated: false },
};

export const LANGUAGE_ORDER: Language[] = ['de', 'en'];

export const WORD_TYPES: { value: WordType; label: string }[] = [
  { value: 'noun', label: 'noun' },
  { value: 'verb', label: 'verb' },
  { value: 'adjective', label: 'adjective' },
  { value: 'adverb', label: 'adverb' },
  { value: 'other', label: 'other' },
];

/** Highest practice level. Words start at 1. */
export const MAX_LEVEL = 5;

export interface Word {
  id: string;
  language: Language;
  type: WordType;
  term: string;
  /** Nouns in a language with genders only. */
  article: string | null;
  /** Nouns only. */
  plural: string | null;
  /**
   * The same noun for the other sex: Lehrerin for der Lehrer, Lehrer for die
   * Lehrerin. Nouns in a language with genders only. Absent on older words.
   */
  counterpart?: string | null;
  /** English meaning. Only for languages that are `translated`. */
  translation: string | null;
  /** English explanation. */
  definition: string | null;
  photo: Blob | null;
  /**
   * SHA-256 of `photo` once sync has uploaded it, so it is hashed and sent
   * only once. Absent when there is no photo or it has not been synced.
   */
  photoKey?: string | null;
  level: number;
  /** Right answers in a row at the current level. Absent on older words. */
  streak?: number;
  /** Learned for good: out of the list's practice, kept in an archive. Absent means not archived. */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What the add and edit sheet works on: every field as the user typed it. */
export interface Draft {
  type: WordType | null;
  term: string;
  article: string | null;
  plural: string;
  counterpart: string;
  translation: string;
  definition: string;
  photo: Blob | null;
}

export function emptyDraft(term = ''): Draft {
  return { type: null, term, article: null, plural: '', counterpart: '', translation: '', definition: '', photo: null };
}

export function draftFromWord(word: Word): Draft {
  return {
    type: word.type,
    term: word.term,
    article: word.article,
    plural: word.plural ?? '',
    counterpart: word.counterpart ?? '',
    translation: word.translation ?? '',
    definition: word.definition ?? '',
    photo: word.photo,
  };
}

export function hasArticle(language: Language, type: WordType | null): boolean {
  return type === 'noun' && LANGUAGES[language].articles !== null;
}

/** Whether a noun can have a counterpart of the other sex: where nouns have genders. */
export const hasCounterpart = hasArticle;

export type Sex = 'male' | 'female';

/** Which sex a person or animal noun names, going by its article. Null when the article does not say. */
export function sexOf(article: string | null): Sex | null {
  return article === 'der' ? 'male' : article === 'die' ? 'female' : null;
}

/** The article of a noun's counterpart: the other of der and die. */
export function counterpartArticle(article: string | null): string | null {
  return article === 'der' ? 'die' : article === 'die' ? 'der' : null;
}

export function hasPlural(type: WordType | null): boolean {
  return type === 'noun';
}

export type DraftProblem = 'term' | 'type' | 'meaning';

/** Why the draft cannot be saved yet, in form order. Empty when it can. */
export function draftProblems(language: Language, draft: Draft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.term.trim()) problems.push('term');
  if (!draft.type) problems.push('type');
  const translation = LANGUAGES[language].translated && draft.translation.trim();
  if (!translation && !draft.definition.trim() && !draft.photo) problems.push('meaning');
  return problems;
}

const clean = (value: string) => value.trim().replace(/\s+/g, ' ') || null;

/**
 * Turns a valid draft into the fields a word stores, dropping whatever the
 * chosen type or language does not use, so switching a noun to a verb leaves
 * no stray article behind.
 */
export function wordFields(language: Language, draft: Draft) {
  if (draftProblems(language, draft).length > 0 || !draft.type) {
    throw new Error('The draft is not complete');
  }
  return {
    language,
    type: draft.type,
    term: clean(draft.term)!,
    article: hasArticle(language, draft.type) ? draft.article : null,
    plural: hasPlural(draft.type) ? clean(draft.plural) : null,
    counterpart: hasCounterpart(language, draft.type) ? clean(draft.counterpart) : null,
    translation: LANGUAGES[language].translated ? clean(draft.translation) : null,
    definition: clean(draft.definition),
    photo: draft.photo,
  };
}

/** A short line under the word in the list: meaning first, then the plural and the counterpart. */
export function wordSummary(word: Word): string {
  const meaning = word.translation ?? word.definition ?? '';
  const other = counterpartArticle(word.article);
  const counterpart = word.counterpart && (other ? `${other} ${word.counterpart}` : word.counterpart);
  return [meaning, word.plural && `pl. ${word.plural}`, counterpart].filter(Boolean).join(' · ');
}
