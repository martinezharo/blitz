import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { testServer } from '../../worker/test-server.ts';
import type { Change, SyncResponse } from '../domain/sync.ts';
import { type Draft, emptyDraft } from '../domain/word.ts';
import { db } from './db.ts';
import { clearLocalData, startSync, stopSync, syncNow } from './sync.ts';
import { addWord, deleteWord, updateWord } from './words.ts';

const bank: Draft = { ...emptyDraft('Bank'), type: 'noun', article: 'die', translation: 'bench' };

let server: Awaited<ReturnType<typeof testServer>>;
/** The account's other device, talking to the server directly. */
let otherDevice: typeof fetch;
let account: string;

beforeAll(async () => {
  server = await testServer();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
});

afterAll(() => server.dispose());

beforeEach(async () => {
  await clearLocalData();
  const token = await server.signUp('ada');
  account = token;
  otherDevice = server.as(token);
  vi.stubGlobal('fetch', server.as(token));
});

afterEach(() => stopSync());

async function remote(cursor = 0, changes: Change[] = []): Promise<SyncResponse> {
  const response = await otherDevice('/api/sync', { method: 'POST', body: JSON.stringify({ cursor, changes }) });
  return response.json() as Promise<SyncResponse>;
}

async function signIn() {
  await startSync(account, () => {});
  await syncNow();
}

describe('sync', () => {
  it('uploads words written before signing in', async () => {
    const word = await addWord('de', bank);
    await signIn();
    expect((await remote()).changes.map((change) => change.word?.term)).toEqual([word.term]);
    expect(await db.pending.count()).toBe(0);
  });

  it('pulls words from another device', async () => {
    await signIn();
    const now = Date.now();
    const id = crypto.randomUUID();
    await remote(0, [
      {
        id,
        updatedAt: now,
        word: { id, language: 'en', type: 'verb', term: 'run', article: null, plural: null, translation: null, definition: 'Move fast', photo: null, level: 0, createdAt: now, updatedAt: now },
      },
    ]);
    await syncNow();
    expect(await db.words.get(id)).toMatchObject({ term: 'run', photo: null });
  });

  it('sends edits and deletions', async () => {
    await signIn();
    const word = await addWord('de', bank);
    await syncNow();
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateWord(word, { ...bank, translation: 'bank' });
    await syncNow();
    expect((await remote()).changes[0]?.word?.translation).toBe('bank');
    await deleteWord(word.id);
    await syncNow();
    expect((await remote()).changes[0]?.word).toBeNull();
  });

  it('lets a newer remote edit win over an older local one', async () => {
    const word = await addWord('de', bank);
    await remote(0, [
      { id: word.id, updatedAt: word.updatedAt + 1000, word: { ...word, photo: null, translation: 'newer', updatedAt: word.updatedAt + 1000 } },
    ]);
    await signIn();
    expect((await db.words.get(word.id))?.translation).toBe('newer');
  });

  it('carries photos across', async () => {
    const photo = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
    const word = await addWord('de', { ...bank, photo });
    await signIn();
    const key = (await db.words.get(word.id))?.photoKey;
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    await clearLocalData();
    await syncNow();
    const pulled = await db.words.get(word.id);
    expect(pulled?.photoKey).toBe(key);
    expect(await pulled?.photo?.text()).toBe('jpeg bytes');
  });

  it("drops another account's words before syncing", async () => {
    await db.meta.put({ key: 'owner', value: 'someone-else' });
    await addWord('de', bank);
    await signIn();
    expect(await db.words.count()).toBe(0);
    expect((await remote()).changes).toEqual([]);
  });
});
