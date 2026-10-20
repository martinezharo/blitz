import { type DictEntry, normalize, type DictSense, type SenseType } from '@blitz/core/dictionary.ts';

/** The parts of a kaikki.org (Wiktextract) entry that are read here. */
export interface RawEntry {
  word?: string;
  pos?: string;
  forms?: { form?: string; tags?: string[]; source?: string }[];
  senses?: { glosses?: string[]; tags?: string[]; form_of?: { word?: string; extra?: string }[] }[];
}

const TYPE_OF_POS: Record<string, SenseType> = {
  noun: 'n',
  verb: 'v',
  adj: 'j',
  adv: 'd',
  prep: 'o',
  postp: 'o',
  conj: 'o',
  pron: 'o',
  intj: 'o',
  num: 'o',
  det: 'o',
  particle: 'o',
  article: 'o',
  phrase: 'o',
  contraction: 'o',
};

const ARTICLE_OF_GENDER: Record<string, string> = { masculine: 'der', feminine: 'die', neuter: 'das' };

/** Meanings that are not what a learner is after: other spellings, old or wrong usage. */
const SKIPPED_TAGS = new Set([
  'form-of',
  'alt-of',
  'abbreviation',
  'initialism',
  'acronym',
  'misspelling',
  'obsolete',
  'archaic',
  'rare',
  'nonstandard',
  'dialectal',
  'error-lemma',
  'no-gloss',
]);

/** "plural of Bank", "alternative form of ..." and the like, for entries with no tag to say so. */
const FORM_GLOSS =
  /^(?:(?:alternative|obsolete|archaic|dated|nonstandard|rare|dialectal|eye dialect|pronunciation|misspelling|superseded)\b.*\b(?:of|for)\b|(?:plural|singular|past|present|simple|inflection|abbreviation|initialism|acronym|contraction|clipping|short|gerund|comparative|superlative|genitive|nominative|accusative|dative|imperative|subjunctive|participle)\b.*\b(?:of|for)\b)/i;

const CONTINUATION = /^(?:or|and|etc|especially|usually|such|as|in|of|on|with|for|used|esp)\b/i;
const DESCRIPTION = /^(?:one|someone|something|a person|a thing) (?:who|that|which)\b/i;
const MAX_TRANSLATION_LENGTH = 28;
const MAX_TRANSLATION_WORDS = 4;
const MAX_TRANSLATIONS = 3;
const MAX_DEFINITION_LENGTH = 140;
/** Meanings kept per word-type of one German entry, and per English word in all. */
const MAX_ENGLISH_SENSES = 5;
const MAX_ENGLISH_SENSES_PER_TYPE = 3;
const MAX_GERMAN_SENSES = 4;

/** A term worth learning: letters, with the odd space, hyphen or apostrophe. */
export function isLearnable(term: string, multiword: boolean): boolean {
  if (term.length > 30 || !/^\p{L}[\p{L}' -]*$/u.test(term)) return false;
  return multiword || !term.includes(' ');
}

/**
 * The meaning of a word that Wiktionary files as a form of another but that
 * is a word to learn of its own: "agent noun of lehren: teacher" (Lehrer),
 * "female equivalent of Lehrer (“teacher”)" (Lehrerin).
 */
function ownMeaning(sense: NonNullable<RawEntry['senses']>[number]): string | undefined {
  const gloss = sense.glosses?.at(-1) ?? '';
  if (!sense.tags?.includes('agent') && !/^(?:fe)?male equivalent of\b/i.test(gloss)) return undefined;
  return sense.form_of?.find((form) => form.extra)?.extra;
}

function usableGlosses(senses: RawEntry['senses']): string[] {
  const out: string[] = [];
  for (const sense of senses ?? []) {
    const own = ownMeaning(sense);
    const tags = own ? sense.tags?.filter((tag) => tag !== 'form-of') : sense.tags;
    if (tags?.some((tag) => SKIPPED_TAGS.has(tag))) continue;
    // Nested meanings list their parents first; the last one is the meaning.
    const gloss = clean(own ?? sense.glosses?.at(-1) ?? '');
    if (gloss && !FORM_GLOSS.test(gloss)) out.push(gloss);
  }
  return out;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');
}

/** Cuts a long definition at a natural break, or at a word. */
export function clip(text: string, max = MAX_DEFINITION_LENGTH): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const stop = Math.max(head.lastIndexOf('; '), head.lastIndexOf(', '), head.lastIndexOf(' '));
  return `${head.slice(0, stop > max / 2 ? stop : max).trimEnd()}…`;
}

/** Splits at commas and semicolons that are not inside brackets. */
function fragments(gloss: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of gloss) {
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if ((char === ',' || char === ';') && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

/** "to rave (to attend a rave)" → "to rave"; null when it reads like a description. */
function shortTranslation(fragment: string): string | null {
  const text = clean(fragment.replace(/\s*[([][^)\]]*[)\]]/g, ''));
  if (!text || text.length > MAX_TRANSLATION_LENGTH) return null;
  if (text.split(' ').length > MAX_TRANSLATION_WORDS || /[:/]/.test(text)) return null;
  // The rest of a sentence the comma cut: "or within a fissure", "especially of ...".
  if (CONTINUATION.test(text)) return null;
  // A description, not a translation: "one who teaches".
  if (DESCRIPTION.test(text)) return null;
  return text;
}

/**
 * The short translations ("bench", "bank") of a German word, from its
 * glosses. Only a word with no short translation gets a definition instead.
 */
export function germanMeaning(glosses: string[]): { g: string[]; d?: string } {
  const g: string[] = [];
  for (const gloss of glosses.slice(0, 3)) {
    for (const part of fragments(gloss).map(shortTranslation)) {
      if (part && !g.some((known) => known.toLowerCase() === part.toLowerCase()) && g.length < MAX_TRANSLATIONS) g.push(part);
    }
  }
  const first = glosses[0];
  return first && g.length === 0 ? { g, d: clip(first) } : { g };
}

/** The plural a German noun's entry gives for itself, if any. */
function germanPlural(entry: RawEntry): string | undefined {
  const forms = entry.forms ?? [];
  const own = forms.find((form) => !form.source && form.tags?.length === 1 && form.tags[0] === 'plural');
  const declined = forms.find(
    (form) => form.source === 'declension' && form.tags?.includes('nominative') && form.tags.includes('plural') && !form.tags.includes('definite'),
  );
  const plural = (own ?? declined)?.form?.trim();
  return plural && /^\p{L}[\p{L}' -]*$/u.test(plural) ? plural : undefined;
}

/** The same noun for the other sex the entry gives: Lehrerin for Lehrer, Lehrer for Lehrerin. */
function germanCounterpart(entry: RawEntry): string | undefined {
  const term = entry.word?.trim();
  const form = entry.forms?.find(
    (form) => !form.source && form.tags?.length === 1 && (form.tags[0] === 'feminine' || form.tags[0] === 'masculine'),
  );
  const counterpart = form?.form?.trim();
  return counterpart && counterpart !== term && /^\p{L}[\p{L}' -]*$/u.test(counterpart) ? counterpart : undefined;
}

function germanArticle(entry: RawEntry): string | undefined {
  for (const sense of entry.senses ?? []) {
    for (const tag of sense.tags ?? []) {
      const article = ARTICLE_OF_GENDER[tag];
      if (article) return article;
    }
  }
  return undefined;
}

/** A German entry as one meaning of its word, or null when it is not worth learning. */
export function germanSense(entry: RawEntry): { term: string; sense: DictSense } | null {
  const type = TYPE_OF_POS[entry.pos ?? ''];
  const term = entry.word?.trim();
  if (!type || !term || !isLearnable(term, true)) return null;
  const glosses = usableGlosses(entry.senses);
  if (glosses.length === 0) return null;

  const { g, d } = germanMeaning(glosses);
  const sense: DictSense = { t: type };
  if (type === 'n') {
    const article = germanArticle(entry);
    const plural = germanPlural(entry);
    // Only a masculine or feminine noun has a counterpart of the other sex.
    const counterpart = article === 'der' || article === 'die' ? germanCounterpart(entry) : undefined;
    if (article) sense.a = article;
    if (plural) sense.p = plural;
    if (counterpart) sense.f = counterpart;
  }
  if (g.length > 0) sense.g = g;
  if (d) sense.d = d;
  return { term, sense };
}

/** The meanings of an English entry, one per definition, most-used first. */
export function englishSenses(entry: RawEntry): { term: string; senses: DictSense[] } | null {
  const type = TYPE_OF_POS[entry.pos ?? ''];
  const term = entry.word?.trim();
  // Lowercase only: proper nouns and initialisms are not words to learn.
  if (!type || !term || term !== term.toLowerCase() || !isLearnable(term, type === 'v')) return null;
  const senses = [...new Set(usableGlosses(entry.senses))]
    .slice(0, MAX_ENGLISH_SENSES_PER_TYPE)
    .map((gloss): DictSense => ({ t: type, d: clip(gloss) }));
  return senses.length > 0 ? { term, senses } : null;
}

export { MAX_ENGLISH_SENSES, MAX_GERMAN_SENSES };

/**
 * The English words that name a German word, for finding it from the
 * translation: "to run" and "run" both give "run".
 */
export function reverseKeys(translations: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const translation of translations) {
    const key = normalize(translation.replace(/^(?:to|a|an|the) /i, ''));
    if (key && key.split(' ').length <= MAX_TRANSLATION_WORDS) keys.add(key);
  }
  return [...keys];
}

/** "to pay out" → "pay out"; "a dining table" → "dining table". */
function bare(translation: string): string {
  return translation
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/^(?:to|a|an|the) /i, '')
    .trim()
    .toLowerCase();
}

/**
 * An English definition for a German meaning: the first definition, of the
 * same type, of its first translation the English dictionary knows. A
 * translation it does not know is tried by its main word too: the noun at the
 * end of "dining table", the verb at the start of "to pay out".
 */
export function englishDefinition(sense: Pick<DictSense, 't' | 'g'>, english: ReadonlyMap<string, DictEntry>): string | undefined {
  for (const translation of sense.g ?? []) {
    const term = bare(translation);
    const words = term.split(' ');
    const head = sense.t === 'v' ? words[0] : words.at(-1);
    for (const candidate of [term, head]) {
      const meaning = english.get(candidate ?? '')?.s.find((known) => sense.t === 'o' || known.t === sense.t);
      if (meaning?.d) return meaning.d;
    }
  }
  return undefined;
}
