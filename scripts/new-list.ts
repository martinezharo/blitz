/**
 * Makes a ready-made list from a theme:
 *
 *   node scripts/new-list.ts "Household objects" [--count 30] [--id household]
 *     [--tint blue] [--model gpt-6-luna] [--effort low] [--force]
 *
 * The model proposes the German words and an icon, the words the curated
 * dictionary does not have yet are written (scripts/curate-dictionary.ts), and
 * the list is checked: a word that still cannot be found is taken out of the
 * file and named. The result is data/lists/<id>.json, a few lines to read over.
 * A list can also be written by hand: see scripts/dictionary/lists.ts.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { LIST_TINTS, type ListTint } from '@blitz/core/lists.ts';
import { readCurated } from './dictionary/curated.ts';
import { askModel } from './dictionary/codex.ts';
import { generateLists, parseWord, readSources, resolveWord } from './dictionary/lists.ts';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    count: { type: 'string', default: '30' },
    id: { type: 'string' },
    tint: { type: 'string' },
    model: { type: 'string', default: 'gpt-6-luna' },
    effort: { type: 'string', default: 'low' },
    force: { type: 'boolean', default: false },
  },
});

const theme = positionals.join(' ').trim();
if (!theme) {
  console.error('Usage: node scripts/new-list.ts "Household objects" [--count 30] [--id household] [--tint blue]');
  process.exit(1);
}
if (args.tint && !LIST_TINTS.includes(args.tint as ListTint)) {
  console.error(`--tint is one of ${LIST_TINTS.join(', ')}`);
  process.exit(1);
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'icons', 'words'],
  properties: {
    name: { type: 'string' },
    icons: { type: 'array', items: { type: 'string' } },
    words: { type: 'array', items: { type: 'string' } },
  },
} as const;

const prompt = `You are building a ready-made vocabulary list for an app that teaches German to English speakers. The theme is: "${theme}".

Return:
- "name": the title of the list, in English, one or two words, in title case.
- "icons": up to 3 names of Lucide icons (https://lucide.dev/icons) that picture the theme, best first, lowercase with hyphens ("apple", "person-standing").
- "words": ${Number(args.count)} German words for the theme, the most useful for a learner first (A1 to B1 level), in the form a dictionary lists them: nouns capitalised, in the singular and without an article; verbs in the infinitive; adjectives lowercase. One word each, no phrases, no names of people or places, no duplicates, no words that only differ in gender or number. If the theme means one particular meaning of a word that has several, write the word, then " > ", then the English word for the meaning meant: "Schloss > castle". Otherwise write just the word.

Return only JSON matching the given schema.`;

console.log(`Asking for a list about "${theme}"...`);
const proposal = (await askModel(prompt, SCHEMA, { model: args.model, effort: args.effort, label: 'new-list' })) as { name: string; icons: string[]; words: string[] };

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const id = args.id ?? slug(proposal.name || theme);
const file = resolve(`data/lists/${id}.json`);
if (existsSync(file) && !args.force) {
  console.error(`data/lists/${id}.json exists already. Use --id for another name, or --force to replace it.`);
  process.exit(1);
}

const icons = (await import('lucide-react/dynamicIconImports.mjs')).default as Record<string, unknown>;
const icon = proposal.icons.find((name) => name in icons) ?? 'list';
const words = [...new Set(proposal.words.map((word) => word.trim()).filter(Boolean))];
const write = (list: string[]) =>
  writeFile(file, `${JSON.stringify({ name: proposal.name, icon, ...(args.tint ? { tint: args.tint } : {}), words: list }, null, 2)}\n`);
await write(words);
console.log(`data/lists/${id}.json: "${proposal.name}", icon ${icon}, ${words.length} words`);

// The words the curated dictionary lacks are written now, German first, then the English ones they give.
console.log('Writing the meanings of the new words...');
await new Promise<void>((done, fail) => {
  const child = spawn(process.execPath, ['scripts/curate-dictionary.ts', '--count', '0', '--batch', '30'], { stdio: 'inherit' });
  child.on('close', (code) => (code === 0 ? done() : fail(new Error(`curate-dictionary exited with ${code}`))));
});

const [german, english] = [await readCurated('de'), await readCurated('en')];
const usable: string[] = [];
const dropped: string[] = [];
for (const word of words) {
  const resolved = resolveWord(word, german, english);
  if ('problem' in resolved) dropped.push(`${parseWord(word).term}: ${resolved.problem}`);
  else usable.push(word);
}
if (dropped.length > 0) {
  await write(usable);
  console.log(`Left out ${dropped.length} word(s) the dictionary could not match:\n  ${dropped.join('\n  ')}`);
}
const { problems } = await generateLists(german, english, { force: true });
const own = problems.filter((problem) => problem.startsWith(`${id}:`));
if (own.length > 0) console.error(`Still to fix in data/lists/${id}.json:\n  ${own.join('\n  ')}`);
else console.log(`Done: ${usable.length} words. Read it over in data/lists/${id}.json, then \`pnpm dev\` to see it.`);
console.log(`(${[...(await readSources()).keys()].length} lists in all)`);
