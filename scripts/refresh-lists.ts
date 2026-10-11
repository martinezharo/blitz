/**
 * Writes the definitions of the ready-made lists (src/domain/lists-definitions.json)
 * from the curated dictionary, so a word imported from a list reads exactly like
 * the same word picked from the dictionary:
 *
 *   node scripts/refresh-lists.ts      (or `pnpm lists`)
 *
 * Every word of the lists has to be in scripts/dictionary/curated/*.json:
 * `node scripts/curate-dictionary.ts --count 0` writes the ones that are missing.
 */
import { writeFile } from 'node:fs/promises';
import { LIST_CONCEPTS } from '../src/domain/lists-concepts.ts';
import { type CuratedSense, readCurated } from './dictionary/curated.ts';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const out: Record<'de' | 'en', Record<string, string>> = { de: {}, en: {} };
const missing: string[] = [];

const [german, english] = [await readCurated('de'), await readCurated('en')];

/** The meaning of the word that the list means: of its type and article, and with its translation when it has one. */
function pick(senses: CuratedSense[] | undefined, type: string, article: string | null, translation: string | null): CuratedSense | undefined {
  const fitting = (senses ?? []).filter((sense) => sense.type === type && (article === null || sense.article === article));
  return fitting.find((sense) => translation && sense.translations.some((known) => same(known.replace(/^to /, ''), translation))) ?? fitting[0];
}

for (const list of LIST_CONCEPTS) {
  for (const concept of list.concepts) {
    const article = concept.type === 'noun' ? concept.de.article : null;
    const translation = 'translation' in concept && concept.translation ? concept.translation : concept.en;
    const de = pick(german.get(concept.de.term), concept.type, article, translation);
    const en = pick(english.get(concept.en), concept.type, null, null);
    if (de) out.de[`${concept.de.term}|${concept.type}`] = de.definition;
    else missing.push(`de ${concept.de.term}`);
    if (en) out.en[`${concept.en}|${concept.type}`] = en.definition;
    else missing.push(`en ${concept.en}`);
  }
}

if (missing.length > 0) {
  console.error(`Not in the curated dictionary yet: ${missing.join(', ')}\nRun: node scripts/curate-dictionary.ts --count 0`);
  process.exit(1);
}
await writeFile(new URL('../src/domain/lists-definitions.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(`${Object.keys(out.de).length} German and ${Object.keys(out.en).length} English definitions written`);
