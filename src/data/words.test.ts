import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Draft, emptyDraft, type Word } from '../domain/word.ts';
import { db } from './db.ts';
import { addWord, deleteWord, fillCounterparts, recordAnswer, setArchived, updateWord } from './words.ts';

const bank: Draft = { ...emptyDraft('Bank'), type: 'noun', article: 'die', translation: 'bench' };

beforeEach(async () => {
  await db.words.clear();
});

describe('words', () => {
  it('adds a word at level one', async () => {
    const word = await addWord('de', bank);
    expect(await db.words.get(word.id)).toMatchObject({ term: 'Bank', article: 'die', level: 1, language: 'de' });
  });

  it('keeps languages apart', async () => {
    await addWord('de', bank);
    await addWord('en', { ...emptyDraft('bench'), type: 'noun', definition: 'A long seat' });
    expect(await db.words.where('language').equals('de').count()).toBe(1);
  });

  it('updates a word and moves updatedAt', async () => {
    const word = await addWord('de', bank);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateWord(word, { ...bank, translation: 'bank' });
    const stored = await db.words.get(word.id);
    expect(stored?.translation).toBe('bank');
    expect(stored!.updatedAt).toBeGreaterThan(word.updatedAt);
    expect(stored!.createdAt).toBe(word.createdAt);
  });

  it('records practice answers', async () => {
    let word = await addWord('de', bank);
    for (let i = 0; i < 3; i++) word = await recordAnswer(word, true);
    expect(await db.words.get(word.id)).toMatchObject({ level: 2, streak: 0 });
    await recordAnswer(word, false);
    expect(await db.words.get(word.id)).toMatchObject({ level: 1, streak: 0 });
  });

  it('archives a word and brings it back', async () => {
    const word = await addWord('de', bank);
    const archived = await setArchived(word, true);
    expect(await db.words.get(word.id)).toMatchObject({ archived: true, streak: 0 });
    expect(await db.pending.get(word.id)).toMatchObject({ at: archived.updatedAt });
    await setArchived(archived, false);
    expect(await db.words.get(word.id)).toMatchObject({ archived: false });
  });

  it('deletes a word', async () => {
    const word = await addWord('de', bank);
    await deleteWord(word.id);
    expect(await db.words.count()).toBe(0);
  });
});

describe('ids', () => {
  it('are v4 UUIDs', async () => {
    const { id } = await addWord('de', bank);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('fillCounterparts', () => {
  const dictionary: Record<string, unknown[]> = {
    '/dict/de/le.json': [{ w: 'Lehrer', r: 1, s: [{ t: 'n', a: 'der', p: 'Lehrer', f: 'Lehrerin', g: ['teacher'] }] }],
    '/dict/de/ar.json': [{ w: 'Arzt', r: 1, s: [{ t: 'n', a: 'der', f: 'Ärztin', g: ['doctor'] }] }],
  };
  const old = (id: string, term: string, article: string | null, patch: Partial<Word> = {}): Word => ({
    id,
    language: 'de',
    type: 'noun',
    term,
    article,
    plural: null,
    translation: 'x',
    definition: null,
    photo: null,
    level: 2,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  });

  beforeEach(async () => {
    await db.pending.clear();
    vi.stubGlobal('fetch', async (url: string) =>
      dictionary[url]
        ? new Response(JSON.stringify(dictionary[url]), { headers: { 'content-type': 'application/json' } })
        : new Response('', { status: 404 }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills the counterpart of nouns saved before, and syncs it', async () => {
    const words = [old('a', 'Lehrer', 'der'), old('b', 'Tisch', 'der')];
    await db.words.bulkAdd(words);
    await fillCounterparts(words);
    expect(await db.words.get('a')).toMatchObject({ counterpart: 'Lehrerin', level: 2 });
    expect((await db.words.get('a'))!.updatedAt).toBeGreaterThan(1);
    // Nothing found: marked, so it is not looked up again, but not synced.
    expect(await db.words.get('b')).toMatchObject({ counterpart: null, updatedAt: 1 });
    expect((await db.pending.toArray()).map((row) => row.id)).toEqual(['a']);
  });

  it('leaves alone a word with another article, or one that already had the field', async () => {
    const words = [old('a', 'Lehrer', 'die'), old('b', 'Arzt', 'der', { counterpart: null })];
    await db.words.bulkAdd(words);
    await fillCounterparts(words);
    expect((await db.words.get('a'))!.counterpart).toBeNull();
    expect((await db.words.get('b'))!.counterpart).toBeNull();
    expect(await db.pending.count()).toBe(0);
  });
});
