import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ListSummary } from '@blitz/core/lists.ts';
import { type CuratedSense, readCurated } from './curated.ts';
import { generateLists, listTerms, parseWord, readSources, resolveList, resolveWord } from './lists.ts';

const noun = (term: string, article: string, translations: string[], definition: string, extra: Partial<CuratedSense> = {}): [string, CuratedSense[]] => [
  term,
  [{ type: 'noun', article, plural: `${term}e`, counterpart: null, translations, definition, ...extra }],
];
const english = (term: string, definition: string): [string, CuratedSense[]] => [
  term,
  [{ type: 'noun', article: null, plural: null, counterpart: null, translations: [], definition }],
];

const german = new Map<string, CuratedSense[]>([
  noun('Apfel', 'der', ['apple'], 'A round fruit'),
  noun('Verkäufer', 'der', ['salesperson', 'shop assistant'], 'A person who sells goods'),
  [
    'Schloss',
    [
      { type: 'noun', article: 'das', plural: 'Schlösser', counterpart: null, translations: ['castle', 'palace'], definition: 'A large grand home' },
      { type: 'noun', article: 'das', plural: 'Schlösser', counterpart: null, translations: ['lock'], definition: 'A device that keeps a door shut' },
    ],
  ],
]);
const englishWords = new Map<string, CuratedSense[]>([
  english('apple', 'A round fruit with a core'),
  english('shop assistant', 'A person who helps customers'),
  english('castle', 'A large old building'),
  english('lock', 'A device with a key'),
]);

describe('parseWord', () => {
  it('splits the word from the English word that names the meaning', () => {
    expect(parseWord('Apfel')).toEqual({ term: 'Apfel', hint: null });
    expect(parseWord(' Schloss > castle ')).toEqual({ term: 'Schloss', hint: 'castle' });
  });
});

describe('resolveWord', () => {
  it('takes the first meaning, and its first translation as the English word', () => {
    const resolved = resolveWord('Apfel', german, englishWords);
    expect(resolved).toEqual({
      de: { term: 'Apfel', type: 'noun', article: 'der', plural: 'Apfele', translation: 'apple', definition: 'A round fruit' },
      en: { term: 'apple', type: 'noun', definition: 'A round fruit with a core' },
    });
  });

  it('takes the meaning translated as the English word it is given, and that is the English word', () => {
    expect(resolveWord('Schloss > lock', german, englishWords)).toMatchObject({ de: { translation: 'lock' }, en: { term: 'lock' } });
    expect(resolveWord('Verkäufer > shop assistant', german, englishWords)).toMatchObject({ en: { term: 'shop assistant' } });
  });

  it('says what is missing', () => {
    expect(resolveWord('Butter', german, englishWords)).toHaveProperty('problem', expect.stringContaining('not in the curated German'));
    expect(resolveWord('Schloss > bolt', german, englishWords)).toHaveProperty('problem', expect.stringContaining('castle/palace'));
    expect(resolveWord('Verkäufer', german, englishWords)).toHaveProperty('problem', expect.stringContaining('"salesperson"'));
  });
});

describe('resolveList', () => {
  it('keeps the order of the words, and says which ones failed or came twice', () => {
    const { words, problems } = resolveList({ name: 'Things', icon: 'apple', words: ['Schloss > lock', 'Apfel', 'Apfel', 'Butter'] }, german, englishWords);
    expect(words.de.map((entry) => entry.term)).toEqual(['Schloss', 'Apfel']);
    expect(words.en.map((entry) => entry.term)).toEqual(['lock', 'apple']);
    expect(problems).toEqual(['Apfel: twice in the list', 'Butter: not in the curated German dictionary']);
  });
});

describe('listTerms', () => {
  it('gives the words the curated dictionary has to hold: German as written, English as the German words give them', () => {
    const terms = listTerms([{ name: 'Things', icon: 'apple', words: ['Apfel', 'Schloss > lock', 'Unknown'] }], german);
    expect(terms).toEqual({ de: ['Apfel', 'Schloss', 'Unknown'], en: ['apple', 'lock'] });
  });
});

describe('the lists of data/lists', () => {
  it('can all be made from the curated dictionary', async () => {
    const out = await mkdtemp(join(tmpdir(), 'blitz-lists-'));
    try {
      const { made, problems } = await generateLists(await readCurated('de'), await readCurated('en'), { out, force: true });
      expect(problems).toEqual([]);
      expect(made).toBe(true);
      const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8')) as ListSummary[];
      const sources = await readSources();
      expect(index.map((list) => list.id).sort()).toEqual([...sources.keys()].sort());
      for (const list of index) {
        expect(list.de.count, list.id).toBe(list.en.count);
        expect(list.de.keys).toHaveLength(list.de.count);
        expect(list.icon.length, `${list.id} icon`).toBeGreaterThan(0);
        const words = JSON.parse(await readFile(join(out, `${list.id}.json`), 'utf8')) as { de: unknown[]; en: unknown[] };
        expect(words.de).toHaveLength(list.de.count);
      }
      // Second time nothing changes.
      expect((await generateLists(await readCurated('de'), await readCurated('en'), { out })).made).toBe(false);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it('are left out, with the reason, when they cannot be made', async () => {
    const out = await mkdtemp(join(tmpdir(), 'blitz-lists-'));
    try {
      const { problems } = await generateLists(new Map(), new Map(), { out, force: true });
      expect(problems.length).toBeGreaterThan(0);
      expect(JSON.parse(await readFile(join(out, 'index.json'), 'utf8'))).toEqual([]);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
