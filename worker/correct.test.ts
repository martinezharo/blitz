import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TEXT } from '../src/domain/writing.ts';
import { type CheckResponse, DAILY_LIMIT, MODEL, correctionRequest, messagesFor, readAnswer } from './correct.ts';
import { sha256 } from './http.ts';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;
let asked: unknown[] = [];
let answer: unknown;
const reply = (value: unknown) => {
  const result = value as { language: string; mistakes: { wrong: string; right: string; kind: string; word: string; why: string }[] };
  const content = { ...result, mistakes: result.mistakes.map(({ wrong, right, ...rest }) => ({ original: wrong, replacement: right, ...rest })) };
  return { status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(content) }] }] };
};
const realFetch = globalThis.fetch;
let providerStatus = 200;

beforeAll(async () => {
  server = await testServer({ OPENAI_API_KEY: 'test-openai-key' });
});

afterAll(() => server.dispose());

beforeEach(() => {
  asked = [];
  answer = reply({ language: 'de', mistakes: [] });
  providerStatus = 200;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) !== 'https://api.openai.com/v1/responses') return realFetch(input, init);
    asked.push(JSON.parse(init!.body as string));
    expect(new Headers(init!.headers).get('Authorization')).toBe('Bearer test-openai-key');
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: providerStatus });
  });
});

afterEach(() => vi.restoreAllMocks());

const check = (fetcher: typeof fetch, body: unknown) =>
  fetcher('/api/correct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const today = () => new Date().toISOString().slice(0, 10);

describe('readAnswer', () => {
  it('reads completed JSON and ignores reasoning output', () => {
    expect(readAnswer(reply({ language: 'de', mistakes: [] }))).toEqual({ language: 'de', mistakes: [] });
    const response = reply({ language: 'en', mistakes: [] });
    expect(readAnswer({ ...response, output: [{ type: 'reasoning', summary: [] }, ...response.output] })).toEqual({ language: 'en', mistakes: [] });
  });

  it('rejects incomplete answers, refusals and missing replacement fields', () => {
    const response = reply({ language: 'en', mistakes: [] });
    expect(readAnswer({ ...response, status: 'incomplete' })).toBeNull();
    expect(readAnswer({ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] })).toBeNull();
    response.output[0]!.content[0]!.text = JSON.stringify({ language: 'en', mistakes: [{ original: 'word', kind: 'grammar', word: '', why: 'Rule' }] });
    expect(readAnswer(response)).toBeNull();
    response.output[0]!.content[0]!.text = '{"language":"en","mistakes":[';
    expect(readAnswer(response)).toBeNull();
  });

  it('preserves explicit deletions when normalizing the model fields', () => {
    expect(readAnswer(reply({ language: 'en', mistakes: [{ wrong: 'extra', right: '', kind: 'grammar', word: '', why: 'Remove the extra word' }] }))).toEqual({ language: 'en', mistakes: [{ wrong: 'extra', right: '', kind: 'grammar', word: '', why: 'Remove the extra word' }] });
  });
});

describe('messagesFor', () => {
  it('names the language and puts the text last', () => {
    const messages = messagesFor('de', 'Ich habe ein Hund.');
    expect(messages[0]!.content).toContain("learner's German writing");
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
    answer = reply({ language: 'other', mistakes: [{ wrong: 'Hola', right: 'Hallo', kind: 'spelling', word: 'Hallo', why: 'Another language' }] });
    const body = (await (await check(fetcher, { language: 'de', text: 'Hola, me llamo Ada.' })).json()) as CheckResponse;
    expect(body).toEqual({ language: 'other', marks: [] });
  });

  it('answers 502 when the model fails or says nothing usable', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    answer = new Error('busy');
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(502);
    answer = { status: 'incomplete', output: [] };
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(502);
  });

  it('uses Luna low with the tested request, bounded output and no stored response', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(200);
    expect(asked).toEqual([correctionRequest('de', 'Hallo Welt')]);
    expect(asked[0]).toMatchObject({ model: MODEL, reasoning: { effort: 'low' }, max_output_tokens: 4000, store: false, text: { format: { type: 'json_schema', strict: true } } });
  });

  it('fails without using allowance or calling OpenAI when the key is missing', async () => {
    const token = await server.signUp('ada');
    const savedKey = server.env.OPENAI_API_KEY;
    const before = await server.env.DB.prepare("SELECT count(*) AS count FROM definition_usage WHERE scope LIKE 'correct:%'").first<{ count: number }>();
    server.env.OPENAI_API_KEY = undefined;
    try {
      expect((await check(server.as(token), { language: 'en', text: 'Hello' })).status).toBe(503);
      expect(asked).toHaveLength(0);
      expect(await server.env.DB.prepare("SELECT count(*) AS count FROM definition_usage WHERE scope LIKE 'correct:%'").first<{ count: number }>()).toEqual(before);
    } finally { server.env.OPENAI_API_KEY = savedKey; }
  });

  it('returns a failure after one attempt for provider HTTP errors', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    providerStatus = 429;
    expect((await check(fetcher, { language: 'de', text: 'Hallo Welt' })).status).toBe(502);
    expect(asked).toHaveLength(1);
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
