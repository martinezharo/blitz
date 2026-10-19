import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayId } from '../src/domain/streak.ts';
import type { Change, SyncResponse, WireWord } from '../src/domain/sync.ts';
import { sha256 } from './http.ts';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;

beforeAll(async () => {
  server = await testServer();
});

afterAll(() => server.dispose());

const word = (id: string, updatedAt: number, term = 'Bank'): WireWord => ({
  id,
  language: 'de',
  type: 'noun',
  term,
  article: 'die',
  plural: null,
  translation: 'bench',
  definition: null,
  photo: null,
  level: 1,
  streak: 0,
  createdAt: 1,
  updatedAt,
});

const change = (id: string, updatedAt: number, term?: string): Change => ({ id, updatedAt, word: word(id, updatedAt, term) });

async function sync(fetcher: typeof fetch, cursor: number, changes: Change[] = []): Promise<SyncResponse> {
  const response = await fetcher('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor, changes }),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<SyncResponse>;
}

const id = () => crypto.randomUUID();

describe('sync', () => {
  it('needs a session', async () => {
    const response = await server.as(null)('/api/sync', { method: 'POST', body: '{"cursor":0,"changes":[]}' });
    expect(response.status).toBe(401);
  });

  it('refuses writes from another origin', async () => {
    const token = await server.signUp('ada');
    const response = await server.as(token)('/api/sync', {
      method: 'POST',
      headers: { Origin: 'https://evil.test' },
      body: '{"cursor":0,"changes":[]}',
    });
    expect(response.status).toBe(403);
  });

  it('hands a change to the next device', async () => {
    const as = server.as(await server.signUp('ada'));
    const first = await sync(as, 0, [change(id(), 10)]);
    const other = await sync(as, 0);
    expect(other.changes).toEqual(first.changes);
    expect((await sync(as, other.cursor)).changes).toEqual([]);
  });

  it('keeps the newest write', async () => {
    const as = server.as(await server.signUp('ada'));
    const wordId = id();
    await sync(as, 0, [change(wordId, 20, 'new')]);
    await sync(as, 0, [change(wordId, 10, 'old')]);
    const { changes } = await sync(as, 0);
    expect(changes).toEqual([change(wordId, 20, 'new')]);
  });

  it('keeps a counterpart, and leaves it absent on words that never had one', async () => {
    const as = server.as(await server.signUp('ada'));
    const [teacher, older] = [id(), id()];
    const withCounterpart: Change = { id: teacher, updatedAt: 5, word: { ...word(teacher, 5, 'Lehrer'), article: 'der', counterpart: 'Lehrerin' } };
    await sync(as, 0, [withCounterpart, change(older, 5)]);
    const { changes } = await sync(as, 0);
    expect(changes.find((found) => found.id === teacher)?.word?.counterpart).toBe('Lehrerin');
    expect(changes.find((found) => found.id === older)?.word).not.toHaveProperty('counterpart');
  });

  it('passes deletions on', async () => {
    const as = server.as(await server.signUp('ada'));
    const wordId = id();
    const { cursor } = await sync(as, 0, [change(wordId, 10)]);
    await sync(as, cursor, [{ id: wordId, updatedAt: 11, word: null }]);
    expect((await sync(as, cursor)).changes).toEqual([{ id: wordId, updatedAt: 11, word: null }]);
  });

  it('keeps accounts apart', async () => {
    const ada = server.as(await server.signUp('ada'));
    const bob = server.as(await server.signUp('bob'));
    await sync(ada, 0, [change(id(), 10)]);
    expect((await sync(bob, 0)).changes).toEqual([]);
  });

  it('pages through long histories', async () => {
    const as = server.as(await server.signUp('ada'));
    for (let batch = 0; batch < 3; batch++) {
      await sync(as, 0, Array.from({ length: 100 }, () => change(id(), 10)));
    }
    const first = await sync(as, 0);
    expect(first.changes).toHaveLength(200);
    expect(first.more).toBe(true);
    const second = await sync(as, first.cursor);
    expect(second.changes).toHaveLength(100);
    expect(second.more).toBe(false);
  });

  it('rejects malformed words', async () => {
    const as = server.as(await server.signUp('ada'));
    const bad = { ...change(id(), 10), word: { ...word(id(), 10), article: 'le' } };
    const response = await as('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: 0, changes: [bad] }),
    });
    expect(response.status).toBe(400);
  });
});

describe('corrections', () => {
  const correction = (correctionId: string, updatedAt: number): Change => ({
    id: correctionId,
    updatedAt,
    kind: 'correction',
    word: null,
    correction: {
      id: correctionId,
      language: 'de',
      written: 'Ich habe ein Hund.',
      corrected: 'Ich habe einen Hund.',
      fixes: [{ wrong: 'ein Hund', right: 'einen Hund', why: 'Accusative', from: [9, 17], to: [9, 19] }],
      createdAt: updatedAt,
      updatedAt,
    },
  });
  const post = (fetcher: typeof fetch, body: unknown) =>
    fetcher('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('travel to the devices that ask for them, and only to those', async () => {
    const as = server.as(await server.signUp('ada'));
    const sentence = correction(id(), 10);
    const bank = change(id(), 11);
    expect((await post(as, { cursor: 0, changes: [sentence, bank], kinds: ['correction'] })).status).toBe(200);

    const knows = (await (await post(as, { cursor: 0, changes: [], kinds: ['correction'] })).json()) as SyncResponse;
    expect(knows.changes).toEqual([sentence, bank]);
    // A device from before corrections existed is only ever sent words.
    const older = await sync(as, 0);
    expect(older.changes).toEqual([bank]);
    expect(older.cursor).toBe(knows.cursor);
  });

  it('are deleted like words', async () => {
    const as = server.as(await server.signUp('ada'));
    const sentenceId = id();
    await post(as, { cursor: 0, changes: [correction(sentenceId, 10)], kinds: ['correction'] });
    await post(as, { cursor: 0, changes: [{ id: sentenceId, updatedAt: 20, kind: 'correction', word: null, correction: null }], kinds: ['correction'] });
    const pulled = (await (await post(as, { cursor: 0, changes: [], kinds: ['correction'] })).json()) as SyncResponse;
    expect(pulled.changes).toEqual([{ id: sentenceId, updatedAt: 20, kind: 'correction', word: null, correction: null }]);
  });

  it('rejects malformed ones', async () => {
    const as = server.as(await server.signUp('ada'));
    const sentence = correction(id(), 10);
    const bad = { ...sentence, correction: { ...sentence.correction!, fixes: [{ wrong: 'x', right: 'y', why: '', from: [0, 99], to: [0, 1] }] } };
    expect((await post(as, { cursor: 0, changes: [bad] })).status).toBe(400);
    expect((await post(as, { cursor: 0, changes: [{ ...sentence, kind: 'note' }] })).status).toBe(400);
  });
});

describe('practised days', () => {
  const day = (date: string, updatedAt: number): Change => ({ id: dayId(date), updatedAt, kind: 'day', word: null, day: date });
  const post = (fetcher: typeof fetch, body: unknown) =>
    fetcher('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('travel to the devices that ask for them, and only to those', async () => {
    const as = server.as(await server.signUp('ada'));
    const monday = day('2026-10-19', 10);
    const bank = change(id(), 11);
    expect((await post(as, { cursor: 0, changes: [monday, bank], kinds: ['correction', 'day'] })).status).toBe(200);

    const knows = (await (await post(as, { cursor: 0, changes: [], kinds: ['correction', 'day'] })).json()) as SyncResponse;
    expect(knows.changes).toEqual([monday, bank]);
    // Devices that know corrections but not days are sent no days.
    const corrections = (await (await post(as, { cursor: 0, changes: [], kinds: ['correction'] })).json()) as SyncResponse;
    expect(corrections.changes).toEqual([bank]);
  });

  it('are one row per day, whichever device practised it', async () => {
    const as = server.as(await server.signUp('ada'));
    await post(as, { cursor: 0, changes: [day('2026-10-19', 10)], kinds: ['day'] });
    await post(as, { cursor: 0, changes: [day('2026-10-19', 20)], kinds: ['day'] });
    const pulled = (await (await post(as, { cursor: 0, changes: [], kinds: ['day'] })).json()) as SyncResponse;
    expect(pulled.changes).toEqual([day('2026-10-19', 20)]);
  });

  it('rejects a day that does not match its id', async () => {
    const as = server.as(await server.signUp('ada'));
    expect((await post(as, { cursor: 0, changes: [{ ...day('2026-10-19', 10), day: '2026-10-20' }] })).status).toBe(400);
    expect((await post(as, { cursor: 0, changes: [{ ...day('2026-10-19', 10), id: id() }] })).status).toBe(400);
  });
});

describe('photos', () => {
  it('stores a photo under the hash of its bytes, per account', async () => {
    const bytes = new TextEncoder().encode('jpeg bytes');
    const key = await sha256(bytes.buffer as ArrayBuffer);
    const ada = server.as(await server.signUp('ada'));
    expect((await ada(`/api/photos/${key}`, { method: 'PUT', body: bytes })).status).toBe(204);
    expect(await (await ada(`/api/photos/${key}`)).text()).toBe('jpeg bytes');
    const bob = server.as(await server.signUp('bob'));
    expect((await bob(`/api/photos/${key}`)).status).toBe(404);
  });

  it('refuses bytes that do not match the key', async () => {
    const ada = server.as(await server.signUp('ada'));
    const response = await ada(`/api/photos/${'0'.repeat(64)}`, { method: 'PUT', body: 'other' });
    expect(response.status).toBe(400);
  });
});
