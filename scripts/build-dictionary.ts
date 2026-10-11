/**
 * Builds the base of the dictionary the new-word line suggests from:
 * `data/dictionary/**`. What the app serves, `public/dict`, is this with the
 * curated meanings put over it (scripts/dictionary/generate.ts), made by vite.
 *
 *   node scripts/build-dictionary.ts [--cache <dir>] [--out <dir>] [--min-count <n>]
 *
 * Sources, downloaded once into the cache directory (about 4.5 GB):
 *   - Wiktionary, as extracted by https://kaikki.org (CC BY-SA), for German
 *     and English words: type, article, plural, translation, definition.
 *   - OpenSubtitles word frequencies (hermitdave/FrequencyWords, CC BY-SA),
 *     used to leave out words nobody uses and to put the common ones first.
 *
 * The output is committed, so nothing here runs on deploy. Rerun it to refresh.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { type DictEntry, type DictKind, type DictSense, normalize, type ReverseEntry, shardKey } from '../src/domain/dictionary.ts';
import { REVERSE_PER_KEY } from './dictionary/curated.ts';
import { englishDefinition, englishSenses, germanSense, MAX_ENGLISH_SENSES, MAX_GERMAN_SENSES, type RawEntry, reverseKeys } from './dictionary/extract.ts';

const { values: args } = parseArgs({
  options: {
    cache: { type: 'string', default: '.cache/dictionary' },
    out: { type: 'string', default: 'data/dictionary' },
    'min-count': { type: 'string', default: '12' },
  },
});

const cache = resolve(args.cache!);
const out = resolve(args.out!);
const minCount = Number(args['min-count']);

const SOURCES = {
  germanDump: 'https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl',
  englishDump: 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl',
  germanFrequency: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_full.txt',
  englishFrequency: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt',
};

async function download(url: string): Promise<string> {
  const file = join(cache, url.split('/').pop()!.replace(/^(de|en)_full/, '$1-frequency'));
  if (existsSync(file)) return file;
  await mkdir(cache, { recursive: true });
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  // To a temporary name first, so an interrupted download is not mistaken for a whole one.
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(`${file}.part`));
  await rename(`${file}.part`, file);
  return file;
}

async function* lines(file: string): AsyncGenerator<string> {
  yield* createInterface({ input: createReadStream(file), crlfDelay: Infinity });
}

/** word → how common it is (0 is the most), for the words said at least `minCount` times. */
async function frequencies(file: string): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  for await (const line of lines(file)) {
    const [word, count] = line.split(' ');
    if (!word || Number(count) < minCount) continue;
    const key = word.toLowerCase();
    if (!ranks.has(key)) ranks.set(key, ranks.size);
  }
  return ranks;
}

/** A term is as rare as its rarest word; unknown when any word is missing. */
function rankOf(term: string, ranks: Map<string, number>): number | undefined {
  let rank = 0;
  for (const word of term.toLowerCase().split(/[ -]+/)) {
    const known = ranks.get(word);
    if (known === undefined) return undefined;
    rank = Math.max(rank, known);
  }
  return rank;
}

async function* entries(file: string): AsyncGenerator<RawEntry> {
  let bad = 0;
  for await (const line of lines(file)) {
    try {
      yield JSON.parse(line) as RawEntry;
    } catch {
      bad++;
    }
  }
  if (bad > 0) console.warn(`${file}: skipped ${bad} unreadable lines`);
}

async function write(kind: DictKind, all: DictEntry[]) {
  const dir = join(out, kind);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const shards = new Map<string, DictEntry[]>();
  for (const entry of all) {
    const key = shardKey(normalize('k' in entry ? (entry as ReverseEntry).k : entry.w));
    shards.set(key, [...(shards.get(key) ?? []), entry]);
  }
  let bytes = 0;
  let biggest = 0;
  for (const [key, shard] of shards) {
    shard.sort((a, b) => a.r - b.r);
    const json = JSON.stringify(shard);
    bytes += json.length;
    biggest = Math.max(biggest, json.length);
    await writeFile(join(dir, `${key}.json`), json);
  }
  console.log(`${kind}: ${all.length} entries, ${shards.size} files, ${(bytes / 1e6).toFixed(1)} MB, biggest ${(biggest / 1e3).toFixed(0)} KB`);
}

function add(into: Map<string, DictEntry>, term: string, rank: number, senses: DictSense[], max: number) {
  const entry = into.get(term) ?? { w: term, r: rank, s: [] };
  entry.s.push(...senses.slice(0, Math.max(0, max - entry.s.length)));
  into.set(term, entry);
}

async function main() {
  const [germanDump, englishDump, germanFrequency, englishFrequency] = await Promise.all([
    download(SOURCES.germanDump),
    download(SOURCES.englishDump),
    download(SOURCES.germanFrequency),
    download(SOURCES.englishFrequency),
  ]);
  const [germanRanks, englishRanks] = await Promise.all([frequencies(germanFrequency), frequencies(englishFrequency)]);
  console.log(`frequencies: ${germanRanks.size} German, ${englishRanks.size} English words`);

  const german = new Map<string, DictEntry>();
  for await (const raw of entries(germanDump)) {
    const parsed = germanSense(raw);
    const rank = parsed ? rankOf(parsed.term, germanRanks) : undefined;
    if (parsed && rank !== undefined) add(german, parsed.term, rank, [parsed.sense], MAX_GERMAN_SENSES);
  }


  const english = new Map<string, DictEntry>();
  for await (const raw of entries(englishDump)) {
    const parsed = englishSenses(raw);
    const rank = parsed ? rankOf(parsed.term, englishRanks) : undefined;
    if (parsed && rank !== undefined) add(english, parsed.term, rank, parsed.senses, MAX_ENGLISH_SENSES);
  }

  // The English Wiktionary gives German words translations, not definitions:
  // a meaning with a translation borrows the English definition of it.
  let defined = 0;
  for (const entry of german.values()) {
    for (const sense of entry.s) {
      const d = englishDefinition(sense, english);
      if (d) {
        sense.d = d;
        defined++;
      }
    }
  }
  console.log(`German meanings defined from their translation: ${defined}`);

  const reverse = new Map<string, ReverseEntry[]>();
  for (const entry of german.values()) {
    for (const sense of entry.s) {
      for (const key of reverseKeys(sense.g ?? [])) {
        if (rankOf(key, englishRanks) === undefined) continue;
        const list = reverse.get(key) ?? [];
        // One word is listed once per translation, however many of its meanings share it.
        const known = list.find((hit) => hit.w === entry.w);
        if (known) known.s.push(sense);
        else list.push({ k: key, w: entry.w, r: entry.r, s: [sense] });
        reverse.set(key, list);
      }
    }
  }
  const reversed = [...reverse.values()].flatMap((list) => list.sort((a, b) => a.r - b.r).slice(0, REVERSE_PER_KEY));

  await write('de', [...german.values()]);
  await write('de-rev', reversed);
  await write('en', [...english.values()]);
}

await main();
