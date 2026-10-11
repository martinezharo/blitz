/**
 * Copies the words of the ready-made lists from the curated dictionary into
 * src/domain/lists-words.json, so a word imported from a list is the same word
 * as one picked from the dictionary, with the same plural, other-sex form,
 * translations and definition:
 *
 *   node scripts/refresh-lists.ts      (or `pnpm lists`)
 *
 * Which meanings a list holds is in src/domain/lists-concepts.ts. Every one has
 * to be in scripts/dictionary/curated/*.json: `node scripts/curate-dictionary.ts
 * --count 0` writes the ones that are missing. Run it again after curating.
 */
import { writeFile } from 'node:fs/promises';
import { readCurated } from './dictionary/curated.ts';
import { listWords } from './dictionary/lists.ts';

const { words, missing } = listWords(await readCurated('de'), await readCurated('en'));
if (missing.length > 0) {
  console.error(`Not in the curated dictionary yet: ${missing.join(', ')}\nRun: node scripts/curate-dictionary.ts --count 0`);
  process.exit(1);
}
await writeFile(new URL('../src/domain/lists-words.json', import.meta.url), `${JSON.stringify(words, null, 1)}\n`);
console.log(`${Object.values(words).reduce((total, list) => total + list.de.length + list.en.length, 0)} words written`);
