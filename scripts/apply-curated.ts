/**
 * Makes what the app serves that is not in git: the dictionary (public/dict),
 * from the base built from Wiktionary (data/dictionary) and the curated meanings
 * (scripts/dictionary/curated/*.json), and the ready-made lists (public/lists),
 * from data/lists and those meanings:
 *
 *   node scripts/apply-curated.ts [--base data/dictionary] [--out public/dict] [--force]
 *
 * `vite dev` and `vite build` do this by themselves when it is out of date, so
 * this is for looking at the result, or after `pnpm dictionary`.
 * See scripts/dictionary/generate.ts and lists.ts.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readCurated } from './dictionary/curated.ts';
import { generateDictionary } from './dictionary/generate.ts';
import { generateLists } from './dictionary/lists.ts';

const { values: args } = parseArgs({
  options: { base: { type: 'string', default: 'data/dictionary' }, out: { type: 'string', default: 'public/dict' }, force: { type: 'boolean', default: false } },
});
const made = await generateDictionary(resolve(args.base!), resolve(args.out!), { force: args.force });
console.log(made ? 'dictionary: made' : 'dictionary: up to date');
const lists = await generateLists(await readCurated('de'), await readCurated('en'), { force: args.force });
console.log(lists.made ? 'lists: made' : 'lists: up to date');
if (lists.problems.length > 0) {
  console.error(`Lists that could not be made:\n  ${lists.problems.join('\n  ')}\nRun \`pnpm curate --count 0\` for words the curated dictionary lacks.`);
  process.exit(1);
}
