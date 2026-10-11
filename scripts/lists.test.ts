import { describe, expect, it } from 'vitest';
import { LIST_CONCEPTS } from '../src/domain/lists-concepts.ts';
import definitions from '../src/domain/lists-definitions.json' with { type: 'json' };
import { readCurated } from './dictionary/curated.ts';

describe('the lists', () => {
  it('have the definitions of the curated dictionary, as `pnpm lists` writes them', async () => {
    const [de, en] = [await readCurated('de'), await readCurated('en')];
    const written: Record<string, Record<string, string>> = definitions;
    // Curating again (--fix) rewrites definitions: this fails until `pnpm lists` is run.
    for (const list of LIST_CONCEPTS) {
      for (const concept of list.concepts) {
        const german = written.de![`${concept.de.term}|${concept.type}`];
        const english = written.en![`${concept.en}|${concept.type}`];
        expect(de.get(concept.de.term)?.some((sense) => sense.definition === german), `${concept.de.term}: ${german}`).toBe(true);
        expect(en.get(concept.en)?.some((sense) => sense.definition === english), `${concept.en}: ${english}`).toBe(true);
      }
    }
  });
});
