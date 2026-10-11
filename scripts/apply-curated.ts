/**
 * Puts the curated meanings (scripts/dictionary/curated/*.json) into the
 * dictionary files in public/dict, without building the dictionary again:
 *
 *   node scripts/apply-curated.ts [--dict public/dict]
 *
 * A word the model wrote meanings for gets exactly those, in that order. The
 * reverse dictionary, which finds a German word from its English translation,
 * is brought in line with them. Running it twice changes nothing the second time.
 * `scripts/build-dictionary.ts` applies the same files when it builds from scratch.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type DictEntry, normalize, type ReverseEntry, shardKey } from '../src/domain/dictionary.ts';
import { applyCurated, type CuratedLanguage, readCurated, reverseEntriesOf } from './dictionary/curated.ts';

const { values: args } = parseArgs({ options: { dict: { type: 'string', default: 'public/dict' } } });
const DICT = resolve(args.dict!);
/** English words that name one German word, kept per English word. As in build-dictionary.ts. */
const REVERSE_PER_KEY = 6;

async function readShards<T>(kind: string): Promise<Map<string, T[]>> {
  const dir = join(DICT, kind);
  const shards = new Map<string, T[]>();
  for (const file of await readdir(dir)) shards.set(file.replace(/\.json$/, ''), JSON.parse(await readFile(join(dir, file), 'utf8')) as T[]);
  return shards;
}

/** Writes only the files whose content changed. */
async function writeShards<T>(kind: string, shards: Map<string, T[]>, before: Map<string, string>): Promise<number> {
  const dir = join(DICT, kind);
  await mkdir(dir, { recursive: true });
  let changed = 0;
  for (const [key, shard] of shards) {
    const json = JSON.stringify(shard);
    if (before.get(key) === json) continue;
    await writeFile(join(dir, `${key}.json`), json);
    changed++;
  }
  return changed;
}

const serialised = <T>(shards: Map<string, T[]>) => new Map([...shards].map(([key, shard]) => [key, JSON.stringify(shard)]));

async function apply(language: CuratedLanguage): Promise<Set<string>> {
  const curated = await readCurated(language);
  const shards = await readShards<DictEntry>(language);
  const before = serialised(shards);
  const touched = new Set<string>();
  for (const [key, shard] of shards) {
    shards.set(
      key,
      shard.map((entry) => {
        const senses = curated.get(entry.w);
        if (!senses) return entry;
        const next = applyCurated(language, entry, { term: entry.w, senses });
        if (next !== entry) touched.add(entry.w);
        return next;
      }),
    );
  }
  const changed = await writeShards(language, shards, before);
  console.log(`${language}: ${curated.size} curated words, ${touched.size} applied, ${changed} files written`);
  return touched;
}

/** The German words whose meanings changed get their English keys again. */
async function reapplyReverse(touched: Set<string>) {
  if (touched.size === 0) return;
  const german = await readShards<DictEntry>('de');
  const english = await readShards<DictEntry>('en');
  const englishWords = new Set([...english.values()].flatMap((shard) => shard.map((entry) => normalize(entry.w))));
  const entries = new Map([...german.values()].flatMap((shard) => shard.map((entry) => [entry.w, entry] as const)));

  const shards = await readShards<ReverseEntry>('de-rev');
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
  const changed = await writeShards('de-rev', rebuilt, before);
  console.log(`de-rev: ${changed} files written`);
}

const touchedGerman = await apply('de');
await apply('en');
await reapplyReverse(touchedGerman);
