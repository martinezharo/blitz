import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSLATE_BATCH } from '../domain/writing.ts';
import { db } from './db.ts';
import { saveCorrections, setCorrectionArchived, translateMissing } from './writing.ts';

const sentence = (at: number) => ({
  written: `Ich habe ein Hund ${at}.`,
  corrected: `Ich habe einen Hund ${at}.`,
  fixes: [{ wrong: 'ein', right: 'einen', why: '', from: [9, 12] as [number, number], to: [9, 14] as [number, number] }],
});

let requests: string[][] = [];
let reply: (sentences: string[]) => Response;

beforeEach(async () => {
  await db.corrections.clear();
  await db.pending.clear();
  requests = [];
  reply = (sentences) => Response.json({ translations: sentences.map((text) => `translated: ${text}`) });
  vi.stubGlobal('navigator', { onLine: true });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    expect(String(input)).toBe('/api/translate');
    const { language, sentences } = JSON.parse(init!.body as string) as { language: string; sentences: string[] };
    expect(language).toBe('de');
    requests.push(sentences);
    return reply(sentences);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('archiving a sentence', () => {
  it('puts it away and brings it back, syncing both', async () => {
    await saveCorrections('de', [sentence(1)]);
    const [saved] = await db.corrections.toArray();
    await db.pending.clear();

    await setCorrectionArchived(saved!.id, true);
    expect(await db.corrections.get(saved!.id)).toMatchObject({ archived: true });
    expect(await db.pending.get(saved!.id)).toMatchObject({ kind: 'correction' });

    await db.pending.clear();
    await setCorrectionArchived(saved!.id, false);
    const back = await db.corrections.get(saved!.id);
    expect(back && 'archived' in back).toBe(false);
    expect(back!.updatedAt).toBeGreaterThanOrEqual(saved!.updatedAt);
    expect(await db.pending.count()).toBe(1);
  });

  it('ignores a sentence that is gone', async () => {
    await setCorrectionArchived('missing', true);
    expect(await db.corrections.count()).toBe(0);
    expect(await db.pending.count()).toBe(0);
  });
});

describe('translating the history', () => {
  it('gives German sentences their meaning, once, and syncs it', async () => {
    await saveCorrections('de', [sentence(1), sentence(2)]);
    await db.pending.clear();
    await translateMissing('de');
    expect((await db.corrections.toArray()).map((correction) => correction.translation).sort()).toEqual([
      'translated: Ich habe einen Hund 1.',
      'translated: Ich habe einen Hund 2.',
    ]);
    expect(await db.pending.count()).toBe(2);

    await translateMissing('de');
    expect(requests).toHaveLength(1);
  });

  it('leaves English and archived sentences alone', async () => {
    await saveCorrections('en', [sentence(1)]);
    await saveCorrections('de', [sentence(2)]);
    const [german] = await db.corrections.where('language').equals('de').toArray();
    await setCorrectionArchived(german!.id, true);
    await translateMissing('en');
    await translateMissing('de');
    expect(requests).toEqual([]);
  });

  it('works through a long history in batches', async () => {
    await saveCorrections('de', Array.from({ length: TRANSLATE_BATCH + 5 }, (_, at) => sentence(at)));
    await translateMissing('de');
    expect(requests.map((batch) => batch.length)).toEqual([TRANSLATE_BATCH, 5]);
    expect(await db.corrections.filter((correction) => correction.translation === undefined).count()).toBe(0);
  });

  it('stops quietly when it cannot, and tries again next time', async () => {
    await saveCorrections('de', [sentence(1)]);
    reply = () => new Response('{}', { status: 429 });
    await translateMissing('de');
    expect((await db.corrections.toArray())[0]!.translation).toBeUndefined();
    expect(await db.pending.count()).toBe(1);

    reply = () => Response.json({ translations: [null] });
    await translateMissing('de');
    expect(requests).toHaveLength(2);

    reply = (sentences) => Response.json({ translations: sentences.map(() => 'I have a dog.') });
    await translateMissing('de');
    expect((await db.corrections.toArray())[0]!.translation).toBe('I have a dog.');
  });

  it('does nothing offline', async () => {
    await saveCorrections('de', [sentence(1)]);
    vi.stubGlobal('navigator', { onLine: false });
    await translateMissing('de');
    expect(requests).toEqual([]);
  });

  it('does not overwrite a translation that arrived meanwhile', async () => {
    await saveCorrections('de', [sentence(1)]);
    const [saved] = await db.corrections.toArray();
    reply = (sentences) => {
      void db.corrections.update(saved!.id, { translation: 'From another device.' });
      return Response.json({ translations: sentences.map(() => 'Mine.') });
    };
    await translateMissing('de');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await db.corrections.get(saved!.id))!.translation).toBe('From another device.');
  });
});
