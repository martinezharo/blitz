/**
 * Makes the dictionary the app serves (public/dict) from the base built from
 * Wiktionary (data/dictionary) and the curated meanings
 * (scripts/dictionary/curated/*.json):
 *
 *   node scripts/apply-curated.ts [--base data/dictionary] [--out public/dict] [--force]
 *
 * `vite dev` and `vite build` do this by themselves when it is out of date, so
 * this is for looking at the result, or after `pnpm dictionary`.
 * See scripts/dictionary/generate.ts.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateDictionary } from './dictionary/generate.ts';

const { values: args } = parseArgs({
  options: { base: { type: 'string', default: 'data/dictionary' }, out: { type: 'string', default: 'public/dict' }, force: { type: 'boolean', default: false } },
});
const made = await generateDictionary(resolve(args.base!), resolve(args.out!), { force: args.force });
if (!made) console.log('dictionary: public/dict is up to date');
