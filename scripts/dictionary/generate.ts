import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type DictEntry, normalize, type ReverseEntry, shardKey } from '@blitz/core/dictionary.ts';
import { applyCurated, type CuratedLanguage, readCurated, REVERSE_PER_KEY, reverseEntriesOf } from './curated.ts';
import { readShards, serialised, writeShards } from './shards.ts';

/**
 * The dictionary the app serves (public/dict) is not versioned: it is made from
 * the base built from Wiktionary (data/dictionary, see scripts/build-dictionary.ts)
 * with the curated meanings (scripts/dictionary/curated/*.json) put over it.
 * Curating more words then changes one JSON file, not hundreds of dictionary files.
 *
 * A word the model wrote meanings for gets exactly those, in that order. The
 * reverse dictionary, which finds a German word from its English translation,
 * is brought in line with them: the keys of the words that changed are written
 * again. That is not byte for byte what a build from scratch gives (an English
 * word that lost a German word does not get back one the cap had cut, and which
 * English words count is told by the dictionary, not by the frequency list), but
 * it finds the same words.
 */

async function applyIn(dict: string, language: CuratedLanguage): Promise<Set<string>> {
  const curated = await readCurated(language);
  const shards = await readShards<DictEntry>(dict, language);
  const before = serialised(shards);
  const touched = new Set<string>();
  for (const [key, shard] of shards) {
    shards.set(
      key,
      shard.map((entry) => {
        const senses = curated.get(entry.w);
        if (!senses) return entry;
        const next = applyCurated(language, entry, { term: entry.w, senses });
        // Only a word whose meanings really changed has its reverse keys written again.
        if (JSON.stringify(next.s) !== JSON.stringify(entry.s)) touched.add(entry.w);
        return next;
      }),
    );
  }
  const changed = await writeShards(dict, language, shards, before);
  if (process.env.DICT_VERBOSE) console.log(`${language}: ${curated.size} curated words, ${touched.size} applied, ${changed} files written`);
  return touched;
}

/** The German words whose meanings changed get their English keys again. */
async function reapplyReverse(dict: string, touched: Set<string>) {
  if (touched.size === 0) return;
  const german = await readShards<DictEntry>(dict, 'de');
  const english = await readShards<DictEntry>(dict, 'en');
  const englishWords = new Set([...english.values()].flatMap((shard) => shard.map((entry) => normalize(entry.w))));
  const entries = new Map([...german.values()].flatMap((shard) => shard.map((entry) => [entry.w, entry] as const)));

  const shards = await readShards<ReverseEntry>(dict, 'de-rev');
  const before = serialised(shards);

  const fresh = new Map<string, ReverseEntry[]>();
  for (const term of touched) {
    for (const hit of reverseEntriesOf(entries.get(term)!, (key) => englishWords.has(key))) {
      const key = shardKey(normalize(hit.k));
      fresh.set(key, [...(fresh.get(key) ?? []), hit]);
    }
  }
  const rebuilt = new Map<string, ReverseEntry[]>();
  for (const key of new Set([...shards.keys(), ...fresh.keys()])) {
    const kept = (shards.get(key) ?? []).filter((hit) => !touched.has(hit.w));
    // Each shard stays sorted by how common the word is, and each English word names few German ones.
    const counts = new Map<string, number>();
    const shard = [...kept, ...(fresh.get(key) ?? [])]
      .sort((a, b) => a.r - b.r)
      .filter((hit) => {
        const count = (counts.get(hit.k) ?? 0) + 1;
        counts.set(hit.k, count);
        return count <= REVERSE_PER_KEY;
      });
    rebuilt.set(key, shard);
  }
  const changed = await writeShards(dict, 'de-rev', rebuilt, before);
  if (process.env.DICT_VERBOSE) console.log(`de-rev: ${changed} files written`);
}


const STAMP = '.generated';
const KINDS = ['de', 'en', 'de-rev'];

/** What the generated dictionary depends on: the curated files, and the base's own stamp if it has one. */
async function inputsHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const language of ['de', 'en']) hash.update(await readFile(resolve(`scripts/dictionary/curated/${language}.json`)).catch(() => ''));
  // The code that decides what the result is.
  for (const file of ['generate.ts', 'curated.ts']) hash.update(await readFile(resolve(`scripts/dictionary/${file}`)));
  return hash.digest('hex');
}

/**
 * Makes `out` from `base` and the curated meanings, unless it is already what
 * they would give (it says so in a stamp file). Returns whether it did anything.
 */
export async function generateDictionary(base: string, out: string, { force = false } = {}): Promise<boolean> {
  const hash = await inputsHash();
  const stamped = await readFile(join(out, STAMP), 'utf8').catch(() => '');
  if (!force && stamped === hash) return false;

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const kind of KINDS) await cp(join(base, kind), join(out, kind), { recursive: true });
  const touched = await applyIn(out, 'de');
  await applyIn(out, 'en');
  await reapplyReverse(out, touched);
  await writeFile(join(out, STAMP), hash);
  return true;
}
