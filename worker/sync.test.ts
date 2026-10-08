import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  level: 0,
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
