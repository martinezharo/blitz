import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LIST_TINTS, listKey, type ListEntry, type ListSide, type ListSummary, type ListTint, type ListWords } from '../../src/domain/lists.ts';
import type { CuratedSense } from './curated.ts';

/**
 * Makes the lists the app loads (public/lists) from the files in data/lists and
 * the curated dictionary.
 *
 * A list is written in German, one word a line, and nothing else about the
 * word: the dictionary has its article, plural, other-sex form, translations
 * and definition, and the English word of the English side is its first
 * translation. A word with several meanings is told apart by the English word
 * that names the one meant: `"Schloss > castle"`. That word is also the English
 * side's word, which is how a list says "shop assistant" and not "salesperson".
 *
 *   { "name": "Food", "icon": "apple", "tint": "orange", "words": ["Apfel", "Brot"] }
 */

export interface ListSource {
  name: string;
  /** The name of a Lucide icon: https://lucide.dev/icons */
  icon: string;
  tint?: ListTint;
  /** Where it comes in the grid; the lists without one follow, by name. */
  order?: number;
  words: string[];
}

type Curated = ReadonlyMap<string, CuratedSense[]>;

const bare = (word: string) => word.replace(/^to /i, '').trim().toLowerCase();

/** "Schloss > castle" is the word Schloss, in the meaning that is translated as castle. */
export function parseWord(spec: string): { term: string; hint: string | null } {
  const [term = '', hint] = spec.split('>');
  return { term: term.trim(), hint: hint?.trim() || null };
}

function entryOf(term: string, sense: CuratedSense): ListEntry {
  const entry: ListEntry = { term, type: sense.type, definition: sense.definition };
  if (sense.article) entry.article = sense.article;
  if (sense.plural) entry.plural = sense.plural;
  if (sense.counterpart) entry.counterpart = sense.counterpart;
  if (sense.translations.length > 0) entry.translation = sense.translations.join(', ');
  return entry;
}

/** The two sides of one word of a list, or what is missing from the dictionary to make them. */
export function resolveWord(spec: string, german: Curated, english: Curated): { de: ListEntry; en: ListEntry } | { problem: string } {
  const { term, hint } = parseWord(spec);
  const senses = german.get(term);
  if (!senses?.length) return { problem: `${term}: not in the curated German dictionary` };
  const sense = hint ? senses.find((candidate) => candidate.translations.some((translation) => bare(translation) === bare(hint))) : senses[0];
  if (!sense) return { problem: `${term}: no meaning translated as "${hint}" (it has: ${senses.map((candidate) => candidate.translations.join('/')).join('; ')})` };

  const word = hint ?? bare(sense.translations[0] ?? '');
  const match = english.get(word)?.find((candidate) => candidate.type === sense.type);
  if (!match) return { problem: `${term}: "${word}" (${sense.type}) is not in the curated English dictionary; say which English word with "${term} > word"` };
  return { de: entryOf(term, sense), en: entryOf(word, match) };
}

/** The words of one list, and what could not be found for it. */
export function resolveList(source: ListSource, german: Curated, english: Curated): { words: ListWords; problems: string[] } {
  const words: ListWords = { de: [], en: [] };
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const spec of source.words) {
    const resolved = resolveWord(spec, german, english);
    if ('problem' in resolved) {
      problems.push(resolved.problem);
      continue;
    }
    const key = listKey(resolved.de.term, resolved.de.article);
    if (seen.has(key)) {
      problems.push(`${resolved.de.term}: twice in the list`);
      continue;
    }
    seen.add(key);
    words.de.push(resolved.de);
    words.en.push(resolved.en);
  }
  return { words, problems };
}

/** The words of the lists that have to be in the curated dictionary: German as written, English as the German words give them. */
export function listTerms(sources: Iterable<ListSource>, german: Curated): { de: string[]; en: string[] } {
  const terms = { de: new Set<string>(), en: new Set<string>() };
  for (const source of sources) {
    for (const spec of source.words) {
      const { term, hint } = parseWord(spec);
      terms.de.add(term);
      const first = german.get(term)?.[0]?.translations[0];
      const word = hint ?? (first ? bare(first) : undefined);
      if (word) terms.en.add(word);
    }
  }
  return { de: [...terms.de], en: [...terms.en] };
}

const side = (entries: ListEntry[]): ListSide => ({
  count: entries.length,
  sample: entries.slice(0, 3).map((entry) => entry.term),
  keys: entries.map((entry) => listKey(entry.term, entry.article)),
});

const LISTS_DIR = 'data/lists';

/** Every list of data/lists, by its file name. */
export async function readSources(dir = LISTS_DIR): Promise<Map<string, ListSource>> {
  const sources = new Map<string, ListSource>();
  const files = await readdir(resolve(dir)).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? [] : Promise.reject(error)));
  for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
    sources.set(file.replace(/\.json$/, ''), JSON.parse(await readFile(join(resolve(dir), file), 'utf8')) as ListSource);
  }
  return sources;
}

/** The drawing of a Lucide icon, or null if there is no icon of that name. */
async function iconNode(name: string): Promise<unknown[] | null> {
  const imports = (await import('lucide-react/dynamicIconImports.mjs')).default as Record<string, () => Promise<{ __iconData: { node: unknown[] } }>>;
  return (await imports[name]?.())?.__iconData.node ?? null;
}

const STAMP = '.generated';

/** What the generated lists depend on: the lists, the curated files, and the code that makes them. */
async function inputsHash(dir: string): Promise<string> {
  const hash = createHash('sha256');
  for (const [id, source] of await readSources(dir)) hash.update(`${id}${JSON.stringify(source)}`);
  for (const language of ['de', 'en']) hash.update(await readFile(resolve(`scripts/dictionary/curated/${language}.json`)).catch(() => ''));
  for (const file of ['scripts/dictionary/lists.ts', 'scripts/dictionary/curated.ts', 'src/domain/lists.ts']) hash.update(await readFile(resolve(file)));
  return hash.digest('hex');
}

/**
 * Makes `out` (public/lists) from the lists, unless it is what they would give.
 * The lists that cannot be made (a word the dictionary lacks, an unknown icon)
 * are left out and reported, so the caller decides whether that stops anything.
 */
export async function generateLists(
  german: Curated,
  english: Curated,
  { out = 'public/lists', dir = LISTS_DIR, force = false } = {},
): Promise<{ made: boolean; problems: string[] }> {
  const target = resolve(out);
  const hash = await inputsHash(dir);
  const stamped = await readFile(join(target, STAMP), 'utf8').catch(() => '');
  if (!force && stamped === hash) return { made: false, problems: [] };

  const sources = [...(await readSources(dir))].sort(([aId, a], [bId, b]) => (a.order ?? 100) - (b.order ?? 100) || aId.localeCompare(bId));
  const problems: string[] = [];
  const summaries: ListSummary[] = [];
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const [id, source] of sources) {
    const icon = await iconNode(source.icon);
    if (!icon) problems.push(`${id}: no Lucide icon called "${source.icon}"`);
    if (source.tint && !LIST_TINTS.includes(source.tint)) problems.push(`${id}: tint "${source.tint}" is not one of ${LIST_TINTS.join(', ')}`);
    const { words, problems: missing } = resolveList(source, german, english);
    problems.push(...missing.map((problem) => `${id}: ${problem}`));
    if (!icon || missing.length > 0 || (source.tint && !LIST_TINTS.includes(source.tint))) continue;
    summaries.push({
      id,
      name: source.name,
      // The colours go round when a list does not choose its own.
      tint: source.tint ?? LIST_TINTS[summaries.length % LIST_TINTS.length]!,
      icon,
      de: side(words.de),
      en: side(words.en),
    });
    await writeFile(join(target, `${id}.json`), JSON.stringify(words));
  }
  await writeFile(join(target, 'index.json'), JSON.stringify(summaries));
  // A list that failed is not stamped as done: it is tried again next time.
  if (problems.length === 0) await writeFile(join(target, STAMP), hash);
  return { made: true, problems };
}
