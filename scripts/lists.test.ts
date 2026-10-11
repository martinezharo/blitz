import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readCurated } from './dictionary/curated.ts';
import { listWords } from './dictionary/lists.ts';

describe('the lists', () => {
  it('are copied from the curated dictionary, as `pnpm lists` writes them', async () => {
    const { words, missing } = listWords(await readCurated('de'), await readCurated('en'));
    expect(missing).toEqual([]);
    // Curating again (--fix, or new words) can change a definition: this fails until `pnpm lists` is run.
    const written = JSON.parse(await readFile(new URL('../src/domain/lists-words.json', import.meta.url), 'utf8'));
    expect(written).toEqual(words);
  });
});
