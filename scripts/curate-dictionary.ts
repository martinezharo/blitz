/**
 * Has a language model write the meanings of the most common words, one clear
 * sense at a time, and saves them in scripts/dictionary/curated/{de,en}.json.
 *
 *   node scripts/curate-dictionary.ts [--language de|en|both] [--count 3000]
 *     [--batch 60] [--concurrency 4] [--model gpt-6-luna] [--effort low]
 *
 * The model is driven through the Codex CLI (`codex exec`), so it runs on a
 * ChatGPT subscription rather than on an API key. Words are taken in order of
 * how common they are, and every batch is saved as soon as it is done: a run
 * can be stopped at any point, and started again where it left off, since the
 * words already written are skipped. It stops by itself when the subscription
 * says it has had enough.
 *
 * Then `node scripts/apply-curated.ts` puts them into public/dict.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { WORD_LISTS } from '../src/domain/lists-catalogue.ts';
import type { DictEntry } from '../src/domain/dictionary.ts';
import { type CuratedLanguage, type CuratedSense, cleanWord, readCurated, writeCurated } from './dictionary/curated.ts';
import { ANSWER_SCHEMA, PROMPTS } from './dictionary/curate-prompt.ts';

const { values: args } = parseArgs({
  options: {
    language: { type: 'string', default: 'both' },
    count: { type: 'string', default: '3000' },
    batch: { type: 'string', default: '60' },
    concurrency: { type: 'string', default: '4' },
    model: { type: 'string', default: 'gpt-6-luna' },
    effort: { type: 'string', default: 'low' },
  },
});

const COUNT = Number(args.count);
const BATCH = Number(args.batch);
const CONCURRENCY = Number(args.concurrency);
const DICT = resolve('public/dict');
const LANGUAGES: CuratedLanguage[] = args.language === 'both' ? ['de', 'en'] : [args.language as CuratedLanguage];
/** Said by the CLI when the plan's allowance is spent. */
const OUT_OF_QUOTA = /usage limit|rate limit|quota|too many requests|\b429\b|try again (?:in|at|later)/i;
const ATTEMPTS = 3;

interface Candidate {
  term: string;
  rank: number;
  entry: DictEntry;
}

async function loadEntries(language: CuratedLanguage): Promise<DictEntry[]> {
  const dir = join(DICT, language);
  const out: DictEntry[] = [];
  for (const file of await readdir(dir)) out.push(...(JSON.parse(await readFile(join(dir, file), 'utf8')) as DictEntry[]));
  return out;
}

/** The words to write, the ones of the lists first, then by how common they are. Words written already are left out. */
async function candidates(language: CuratedLanguage): Promise<Candidate[]> {
  const entries = await loadEntries(language);
  const done = await readCurated(language);
  const byTerm = new Map(entries.map((entry) => [entry.w, entry]));
  const listed = new Set(WORD_LISTS.flatMap((list) => list.words[language].map((word) => word.term)));
  const wanted = (entry: DictEntry) => !done.has(entry.w) && !entry.s.every((sense) => sense.c === 1);
  const first = [...listed].map((term) => byTerm.get(term)).filter((entry): entry is DictEntry => !!entry && wanted(entry));
  // The most common words, written yet or not: asking for 4000 means the first 4000.
  const common = entries
    .filter((entry) => /^\p{L}+$/u.test(entry.w) && !listed.has(entry.w))
    .sort((a, b) => a.r - b.r || a.w.localeCompare(b.w))
    .slice(0, COUNT)
    .filter(wanted);
  return [...first, ...common].map((entry) => ({ term: entry.w, rank: entry.r, entry }));
}

function inputOf(language: CuratedLanguage, candidate: Candidate) {
  const dictionary =
    language === 'de'
      ? candidate.entry.s.map((sense) => ({
          type: { n: 'noun', v: 'verb', j: 'adjective', d: 'adverb', o: 'other' }[sense.t],
          ...(sense.a ? { article: sense.a } : {}),
          ...(sense.p ? { plural: sense.p } : {}),
          ...(sense.g ? { translations: sense.g } : {}),
        }))
      : [...new Set(candidate.entry.s.map((sense) => ({ n: 'noun', v: 'verb', j: 'adjective', d: 'adverb', o: 'other' })[sense.t]))].map((type) => ({ type }));
  return { term: candidate.term, dictionary };
}

let stopped = false;

/** One run of the model over some words. Returns what it wrote, as raw data. */
async function ask(language: CuratedLanguage, batch: Candidate[], label: string): Promise<unknown[]> {
  const dir = join(tmpdir(), 'blitz-curate');
  await mkdir(dir, { recursive: true });
  const schema = join(dir, 'schema.json');
  const out = join(dir, `${process.pid}-${label}.json`);
  await writeFile(schema, JSON.stringify(ANSWER_SCHEMA));
  const prompt = `${PROMPTS[language]}\n\nINPUT:\n${JSON.stringify({ language, words: batch.map((candidate) => inputOf(language, candidate)) })}`;

  const log: string[] = [];
  await new Promise<void>((done, fail) => {
    // Run away from the repository: the model has nothing to read or change here.
    const child = spawn(
      'codex',
      ['exec', '-m', args.model!, '-c', `model_reasoning_effort="${args.effort}"`, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--output-schema', schema, '-o', out, '-'],
      { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const timer = setTimeout(() => child.kill('SIGKILL'), 20 * 60_000);
    child.stdout.on('data', (chunk) => log.push(String(chunk)));
    child.stderr.on('data', (chunk) => log.push(String(chunk)));
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return done();
      fail(new Error(log.join('').slice(-600) || `codex exited with ${code}`));
    });
    child.stdin.end(prompt);
  }).catch((error: Error) => {
    if (OUT_OF_QUOTA.test(error.message)) stopped = true;
    throw error;
  });
  const answer = JSON.parse(await readFile(out, 'utf8')) as { words?: unknown[] };
  return answer.words ?? [];
}

interface Written {
  term: string;
  senses: CuratedSense[];
}

/** Writes the words of a batch, asking again for the ones that came back unusable. */
async function curate(language: CuratedLanguage, batch: Candidate[], label: string): Promise<{ done: Written[]; failed: string[] }> {
  const done: Written[] = [];
  let pending = batch;
  for (let attempt = 1; attempt <= ATTEMPTS && pending.length > 0 && !stopped; attempt++) {
    try {
      const answers = await ask(language, pending, `${label}-${attempt}`);
      const wanted = new Set(pending.map((candidate) => candidate.term));
      const got = new Set<string>();
      for (const raw of answers) {
        const cleaned = cleanWord(language, raw);
        if (!('word' in cleaned) || !wanted.has(cleaned.word.term) || got.has(cleaned.word.term)) continue;
        got.add(cleaned.word.term);
        done.push(cleaned.word);
      }
      pending = pending.filter((candidate) => !got.has(candidate.term));
    } catch (error) {
      console.error(`[${language}] ${label} attempt ${attempt}: ${(error as Error).message.split('\n').slice(-3).join(' | ')}`);
    }
  }
  return { done, failed: pending.map((candidate) => candidate.term) };
}

async function run(language: CuratedLanguage) {
  const merged = await readCurated(language);
  const all = await candidates(language);
  const batches: { label: string; words: Candidate[] }[] = [];
  for (let start = 0; start < all.length; start += BATCH) {
    batches.push({ label: String(start).padStart(6, '0'), words: all.slice(start, start + BATCH) });
  }
  console.log(`[${language}] ${merged.size} words written already, ${all.length} to write in ${batches.length} batches`);

  let next = 0;
  let finished = 0;
  // One write of the file at a time, whichever batch finishes.
  let saving = Promise.resolve();
  async function worker() {
    while (next < batches.length && !stopped) {
      const batch = batches[next++]!;
      const { done, failed } = await curate(language, batch.words, batch.label);
      // A batch cut short by the allowance is asked for again from the start next time.
      for (const word of done) merged.set(word.term, word.senses);
      saving = saving.then(() => writeCurated(language, merged));
      await saving;
      finished++;
      console.log(`[${language}] ${finished}/${batches.length} batches, ${merged.size} words · ${batch.label}: ${done.length}/${batch.words.length}${failed.length ? `, left out: ${failed.join(' ')}` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

for (const language of LANGUAGES) {
  await run(language);
  if (stopped) {
    console.log('The subscription has no more room for now. Run again later to carry on.');
    break;
  }
}
