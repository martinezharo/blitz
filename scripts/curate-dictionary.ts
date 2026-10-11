/**
 * Has a language model write the meanings of the most common words, one clear
 * sense at a time, and saves them in scripts/dictionary/curated/{de,en}.json.
 *
 *   node scripts/curate-dictionary.ts [--language de|en|both] [--count 3000]
 *     [--batch 60] [--concurrency 4] [--model gpt-6-luna] [--effort low] [--fix [--only <problem>]]
 *
 * The model is driven through the Codex CLI (`codex exec`), so it runs on a
 * ChatGPT subscription rather than on an API key. Words are taken in order of
 * how common they are, and every batch is saved as soon as it is done: a run
 * can be stopped at any point, and started again where it left off, since the
 * words already written are skipped. It stops by itself when the subscription
 * says it has had enough.
 *
 * With --fix it writes nothing new: it sends the definitions that use the word
 * they define, or run long, back to the model to be rewritten, and keeps the new
 * ones only where they are better. `--only synonym` repairs just the problems
 * that name that text, here the ones that are only another word for the word.
 *
 * Then `pnpm dev` or `pnpm build` makes public/dict from them (or `pnpm curated`).
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type DictEntry, SENSE_TYPES } from '../src/domain/dictionary.ts';
import { definitionProblems } from '../src/domain/definition-style.ts';
import { type CuratedLanguage, type CuratedSense, cleanWord, readCurated, writeCurated } from './dictionary/curated.ts';
import { ANSWER_SCHEMA, PROMPTS, REVISION } from './dictionary/curate-prompt.ts';
import { askModel } from './dictionary/codex.ts';
import { listTerms, readSources } from './dictionary/lists.ts';
import { readEntries } from './dictionary/shards.ts';

const { values: args } = parseArgs({
  options: {
    language: { type: 'string', default: 'both' },
    count: { type: 'string', default: '3000' },
    batch: { type: 'string', default: '60' },
    concurrency: { type: 'string', default: '4' },
    model: { type: 'string', default: 'gpt-6-luna' },
    effort: { type: 'string', default: 'low' },
    fix: { type: 'boolean', default: false },
    only: { type: 'string' },
  },
});

const COUNT = Number(args.count);
const BATCH = Number(args.batch);
const CONCURRENCY = Number(args.concurrency);
const DICT = resolve('data/dictionary');
const LANGUAGES: CuratedLanguage[] = args.language === 'both' ? ['de', 'en'] : [args.language as CuratedLanguage];
/** Said by the CLI when the plan's allowance is spent. */
const OUT_OF_QUOTA = /usage limit|rate limit|quota|too many requests|\b429\b|try again (?:in|at|later)/i;
/** How many failures in a row that sound like it it takes to believe it. */
const STRIKES_TO_STOP = 3;
const ATTEMPTS = 3;

interface Candidate {
  term: string;
  rank: number;
  entry: DictEntry;
  /** With --fix: what was written for the word before. */
  current?: CuratedSense[];
}

/** The problems of each meaning of a word that has been written, in order. */
const problemsOf = (term: string, senses: readonly CuratedSense[]) => senses.map((sense) => definitionProblems(term, sense.translations, sense.definition, sense.type));

/** The words to write, the ones of the lists first, then by how common they are. Words written already are left out. */
async function candidates(language: CuratedLanguage): Promise<Candidate[]> {
  const done = await readCurated(language);
  if (args.fix) {
    return [...done]
      .filter(([term, senses]) => problemsOf(term, senses).some((problems) => problems.some((problem) => !args.only || problem.includes(args.only))))
      .map(([term, senses]) => ({ term, rank: 0, entry: { w: term, r: 0, s: [] }, current: senses }));
  }
  const entries = await readEntries<DictEntry>(DICT, language);
  const byTerm = new Map(entries.map((entry) => [entry.w, entry]));
  // The words of the lists: the German ones as written, the English ones as the German
  // words give them, which needs those written first (German is done before English).
  const listed = new Set(listTerms((await readSources()).values(), await readCurated('de'))[language]);
  const wanted = (entry: DictEntry) => !done.has(entry.w) && (entry.s.length === 0 || !entry.s.every((sense) => sense.c === 1));
  // A word of the lists the dictionary does not have is written too, from the word alone.
  const first = [...listed].map((term) => byTerm.get(term) ?? { w: term, r: 0, s: [] }).filter(wanted);
  // The most common words, written yet or not: asking for 4000 means the first 4000.
  const common = entries
    .filter((entry) => /^\p{L}+$/u.test(entry.w) && !listed.has(entry.w))
    .sort((a, b) => a.r - b.r || a.w.localeCompare(b.w))
    .slice(0, COUNT)
    .filter(wanted);
  return [...first, ...common].map((entry) => ({ term: entry.w, rank: entry.r, entry }));
}

function inputOf(language: CuratedLanguage, candidate: Candidate) {
  if (candidate.current) {
    const problems = problemsOf(candidate.term, candidate.current);
    return {
      term: candidate.term,
      current: candidate.current.map((sense, index) => ({ ...sense, ...(problems[index]!.length ? { problem: problems[index]!.join('; ') } : {}) })),
    };
  }
  const dictionary =
    language === 'de'
      ? candidate.entry.s.map((sense) => ({
          type: SENSE_TYPES[sense.t],
          ...(sense.a ? { article: sense.a } : {}),
          ...(sense.p ? { plural: sense.p } : {}),
          ...(sense.g ? { translations: sense.g } : {}),
        }))
      : [...new Set(candidate.entry.s.map((sense) => SENSE_TYPES[sense.t]))].map((type) => ({ type }));
  return { term: candidate.term, dictionary };
}

let stopped = false;
let strikes = 0;

/** One run of the model over some words. Returns what it wrote, as raw data. */
async function ask(language: CuratedLanguage, batch: Candidate[], label: string): Promise<unknown[]> {
  const prompt = `${PROMPTS[language]}${args.fix ? `\n\n${REVISION}` : ''}\n\nINPUT:\n${JSON.stringify({ language, words: batch.map((candidate) => inputOf(language, candidate)) })}`;
  try {
    const answer = (await askModel(prompt, ANSWER_SCHEMA, { model: args.model, effort: args.effort, label })) as { words?: unknown[] };
    strikes = 0;
    return answer.words ?? [];
  } catch (error) {
    // One odd message is not the end of the allowance; several in a row, with no batch between, are.
    if (OUT_OF_QUOTA.test((error as Error).message) && ++strikes >= STRIKES_TO_STOP) stopped = true;
    throw error;
  }
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
        // A repair is kept only if it leaves fewer problems than the definitions it replaces.
        const before = pending.find((candidate) => candidate.term === cleaned.word.term)?.current;
        const count = (term: string, senses: readonly CuratedSense[]) => problemsOf(term, senses).flat().length;
        if (before && count(cleaned.word.term, cleaned.word.senses) >= count(cleaned.word.term, before)) continue;
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
      // A write that fails is reported and the next one carries everything: the words are in memory.
      saving = saving.then(() => writeCurated(language, merged)).catch((error) => console.error(`[${language}] could not save: ${(error as Error).message}`));
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
