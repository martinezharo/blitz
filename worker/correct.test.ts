import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_TEXT } from '../src/domain/writing.ts';
import { type CheckResponse, DAILY_LIMIT, messagesFor, readAnswer } from './correct.ts';
import { sha256 } from './http.ts';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;
let asked: unknown[] = [];
let answer: unknown;
const reply = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });

const ai = {
  async run(_model: string, input: unknown) {
    asked.push(input);
    if (answer instanceof Error) throw answer;
    return answer;
  },
};

beforeAll(async () => {
  server = await testServer({ AI: ai as never });
});

afterAll(() => server.dispose());

beforeEach(() => {
  asked = [];
  answer = reply({ language: 'de', mistakes: [] });
});

const check = (fetcher: typeof fetch, body: unknown) =>
  fetcher('/api/correct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const today = () => new Date().toISOString().slice(0, 10);

describe('readAnswer', () => {
  it('reads the JSON, also when the model talks around it', () => {
    expect(readAnswer(reply({ language: 'de', mistakes: [] }))).toEqual({ language: 'de', mistakes: [] });
    expect(readAnswer({ response: 'Sure! {"language": "en", "mistakes": []} Hope it helps.' })).toEqual({ language: 'en', mistakes: [] });
    expect(readAnswer({ response: 'no json here' })).toBeNull();
  });
});

describe('messagesFor', () => {
  it('names the language and puts the text last', () => {
    const messages = messagesFor('de', 'Ich habe ein Hund.');
    expect(messages[0]!.content).toContain('learners of German');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Ich habe ein Hund.' });
  });
});

describe('/api/correct', () => {
  it('is for accounts only', async () => {
    const response = await check(server.as(null), { language: 'de', text: 'Hallo' });
    expect(response.status).toBe(401);
    expect(asked).toHaveLength(0);
  });

  it('refuses requests from another origin', async () => {
    const response = await check((input, init) => server.as(null)(input, { ...init, headers: { Origin: 'https://evil.test' } }), { language: 'de', text: 'Hallo' });
    expect(response.status).toBe(403);
  });

  it('wants a language it knows and some text, not too much', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    expect((await check(fetcher, { language: 'fr', text: 'Bonjour' })).status).toBe(400);
    expect((await check(fetcher, { language: 'de', text: '   ' })).status).toBe(400);
    expect((await check(fetcher, { language: 'de', text: 'a'.repeat(MAX_TEXT + 1) })).status).toBe(413);
    expect(asked).toHaveLength(0);
  });

  it('marks only what is really in the text', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    answer = reply({
      language: 'de',
      mistakes: [
        { wrong: 'ein Hund', right: 'einen Hund', kind: 'grammar', word: '', why: 'Accusative' },
        { wrong: 'eine Katze', right: 'einer Katze', kind: 'grammar', word: '', why: 'Not in the text' },
      ],
    });
    const response = await check(fetcher, { language: 'de', text: 'Ich habe ein Hund.' });
    const body = (await response.json()) as CheckResponse;
    expect(body.language).toBe('de');
    expect(body.marks.map((mark) => [mark.wrong, mark.right, mark.start, mark.end])).toEqual([['ein Hund', 'einen Hund', 9, 17]]);
  });

  it('marks nothing in a text that is not in the language of the page', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    answer = reply({ language: 'other', mistakes: [{ wrong: 'Hola', right: 'Hallo', kind: 'spelling', word: 'Hallo', why: '' }] });
    const body = (await (await check(fetcher, { language: 'de', text: 'Hola, me llamo Ada.' })).json()) as CheckResponse;
    expect(body).toEqual({ language: 'other', marks: [] });
  });

  it('answers 502 when the model fails or says nothing usable', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    answer = new Error('busy');
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(502);
    answer = { response: 'I cannot help with that.' };
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(502);
  });

  it('stops an account at its daily allowance, apart from definitions', async () => {
    const token = await server.signUp('ada');
    const fetcher = server.as(token);
    const { user_id: id } = (await server.env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(await sha256(token)).first<{ user_id: string }>())!;
    await server.env.DB.prepare('INSERT INTO definition_usage (day, scope, count) VALUES (?, ?, ?)')
      .bind(today(), `correct:user:${id}`, DAILY_LIMIT.perAccount)
      .run();
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(429);
    expect(asked).toHaveLength(0);
    const definitions = await server.env.DB.prepare('SELECT count FROM definition_usage WHERE day = ? AND scope = ?').bind(today(), `user:${id}`).first();
    expect(definitions).toBeNull();
  });
});
