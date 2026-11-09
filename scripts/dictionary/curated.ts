import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkDefinition } from '../../src/domain/definition-style.ts';
import { type DictEntry, type DictSense, normalize, type ReverseEntry, SENSE_TYPE_OF } from '../../src/domain/dictionary.ts';
import { LANGUAGES, WORD_TYPES, type WordType } from '../../src/domain/word.ts';
import { reverseKeys } from './extract.ts';

/**
 * Meanings of common words written by a language model instead of taken from
 * Wiktionary (see scripts/curate-dictionary.ts). Wiktionary lumps meanings
 * together, gives German words a definition borrowed from the wrong
 * translation and orders English meanings by etymology, not by use. Here each
 * meaning is one clear sense with its own short translations and definition.
 */

export interface CuratedSense {
  type: WordType;
  /** der, die or das. German nouns only. */
  article: string | null;
  plural: string | null;
  /** The same noun for the other sex. German nouns for people and animals only. */
  counterpart: string | null;
  /** Short English translations of this meaning. German words only. */
  translations: string[];
  definition: string;
}

export interface CuratedWord {
  term: string;
  senses: CuratedSense[];
}

export type CuratedLanguage = 'de' | 'en';

const MAX_CURATED_SENSES = 4;
/** How many German words one English word names in the reverse dictionary. */
export const REVERSE_PER_KEY = 6;
const MAX_TRANSLATIONS = 3;
const MAX_TRANSLATION_LENGTH = 30;
const ARTICLES = new Set(LANGUAGES.de.articles ?? []);
const TYPES = new Set<string>(WORD_TYPES.map((type) => type.value));

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * Tidies one meaning from the model, or says why it cannot be used. Small
 * slips that change nothing (a full stop, a plural on a verb) are mended.
 */
export function cleanSense(language: CuratedLanguage, raw: unknown): { sense: CuratedSense } | { problem: string } {
  const value = (raw ?? {}) as Record<string, unknown>;
  const type = text(value.type);
  if (!TYPES.has(type)) return { problem: `type "${type}"` };
  const checked = checkDefinition(value.definition);
  if ('problem' in checked) return checked;
  const { definition } = checked;

  const translations = Array.isArray(value.translations) ? value.translations.map(text).filter(Boolean) : [];
  if (language === 'de') {
    if (translations.length === 0 || translations.length > MAX_TRANSLATIONS) return { problem: `${translations.length} translations` };
    if (translations.some((translation) => translation.length > MAX_TRANSLATION_LENGTH)) return { problem: 'long translation' };
  }

  const noun = type === 'noun' && language === 'de';
  const article = noun ? text(value.article) || null : null;
  if (article && !ARTICLES.has(article)) return { problem: `article "${article}"` };
  const plural = noun ? text(value.plural) || null : null;
  const counterpart = noun && (article === 'der' || article === 'die') ? text(value.counterpart) || null : null;
  return {
    sense: { type: type as WordType, article, plural, counterpart, translations: language === 'de' ? translations : [], definition },
  };
}

/** A word as the model returned it, cleaned, or the reasons it cannot be used at all. */
export function cleanWord(language: CuratedLanguage, raw: unknown): { word: CuratedWord } | { problems: string[] } {
  const value = (raw ?? {}) as Record<string, unknown>;
  const term = text(value.term);
  if (!term || !Array.isArray(value.senses)) return { problems: ['not a word'] };
  const problems: string[] = [];
  const senses: CuratedSense[] = [];
  const seen = new Set<string>();
  for (const candidate of value.senses) {
    const cleaned = cleanSense(language, candidate);
    if ('problem' in cleaned) {
      problems.push(cleaned.problem);
      continue;
    }
    const { sense } = cleaned;
    const key = [sense.type, sense.article, normalize(sense.translations.join(' ')), normalize(sense.definition)].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    senses.push(sense);
  }
  // One bad meaning spoils the word: the rest might have been picked to go with it.
  if (problems.length > 0) return { problems };
  if (senses.length > MAX_CURATED_SENSES) return { problems: [`${senses.length} meanings`] };
  return { word: { term, senses } };
}

/**
 * The dictionary's own form of a curated meaning. The plural of a German noun
 * is the model's, or the dictionary's for the same article when the model gave
 * none: a noun the model calls uncountable may still have one in Wiktionary.
 */
export function toDictSense(language: CuratedLanguage, sense: CuratedSense, known: readonly DictSense[] = []): DictSense {
  const out: DictSense = { t: SENSE_TYPE_OF[sense.type] };
  if (language === 'de' && sense.type === 'noun') {
    if (sense.article) out.a = sense.article;
    const plural = sense.plural ?? known.find((old) => old.t === 'n' && old.a === sense.article && old.p)?.p;
    if (plural) out.p = plural;
    if (sense.counterpart) out.f = sense.counterpart;
  }
  if (sense.translations.length > 0) out.g = sense.translations;
  out.d = sense.definition;
  // Marks a definition written for learners, as opposed to one cut from Wiktionary.
  out.c = 1;
  return out;
}

/** Replaces the meanings of an entry with the curated ones. A word the model gave nothing for is left as it was. */
export function applyCurated(language: CuratedLanguage, entry: DictEntry, word: CuratedWord): DictEntry {
  if (word.senses.length === 0) return entry;
  return { ...entry, s: word.senses.map((sense) => toDictSense(language, sense, entry.s)) };
}

/**
 * The reverse-dictionary entries a German word has, one per English word that
 * names it: "teacher" finds Lehrer. `isWord` says which English words are worth
 * a key.
 */
export function reverseEntriesOf(entry: DictEntry, isWord: (key: string) => boolean): ReverseEntry[] {
  const out = new Map<string, ReverseEntry>();
  for (const sense of entry.s) {
    for (const key of reverseKeys(sense.g ?? [])) {
      if (!isWord(key)) continue;
      const known = out.get(key);
      if (known) known.s.push(sense);
      else out.set(key, { k: key, w: entry.w, r: entry.r, s: [sense] });
    }
  }
  return [...out.values()];
}

// ---- The committed files: scripts/dictionary/curated/{de,en}.json

// Relative to where it runs (the repository root, for the scripts, vite and the tests): this is also
// imported by vite.config.ts, whose bundling would point `import.meta.url` at the config file.
const CURATED_DIR = pathToFileURL(`${resolve('scripts/dictionary/curated')}/`);

/** Meanings by word, with the empty fields left out to keep the files small. */
type CuratedFile = Record<string, Partial<CuratedSense>[]>;

export function packSense(sense: CuratedSense): Partial<CuratedSense> {
  const out: Partial<CuratedSense> = { type: sense.type };
  if (sense.article) out.article = sense.article;
  if (sense.plural) out.plural = sense.plural;
  if (sense.counterpart) out.counterpart = sense.counterpart;
  if (sense.translations.length > 0) out.translations = sense.translations;
  out.definition = sense.definition;
  return out;
}

export function unpackSense(packed: Partial<CuratedSense>): CuratedSense {
  return {
    type: packed.type!,
    article: packed.article ?? null,
    plural: packed.plural ?? null,
    counterpart: packed.counterpart ?? null,
    translations: packed.translations ?? [],
    definition: packed.definition!,
  };
}

export async function readCurated(language: CuratedLanguage): Promise<Map<string, CuratedSense[]>> {
  const { readFile } = await import('node:fs/promises');
  try {
    const file = JSON.parse(await readFile(new URL(`${language}.json`, CURATED_DIR), 'utf8')) as CuratedFile;
    return new Map(Object.entries(file).map(([term, senses]) => [term, senses.map(unpackSense)]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }
}

/** Written in the order given, which is by how common the words are. */
export async function writeCurated(language: CuratedLanguage, words: Iterable<[string, CuratedSense[]]>): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(CURATED_DIR, { recursive: true });
  // One word to a line, so a change to a few words is a small diff.
  const lines = [...words].map(([term, senses]) => `${JSON.stringify(term)}:${JSON.stringify(senses.map(packSense))}`);
  await writeFile(new URL(`${language}.json`, CURATED_DIR), `{\n${lines.join(',\n')}\n}\n`);
}
