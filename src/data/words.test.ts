import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Draft, emptyDraft } from '../domain/word.ts';
import { db } from './db.ts';
import { addWord, deleteWord, recordAnswer, setArchived, updateWord } from './words.ts';

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
