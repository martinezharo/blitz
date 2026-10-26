import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TRANSLATED, TRANSLATE_BATCH } from '../src/domain/writing.ts';
import { sha256 } from './http.ts';
import { testServer } from './test-server.ts';
import { DAILY_LIMIT, MODEL, readTranslations, translationRequest } from './translate.ts';

let server: Awaited<ReturnType<typeof testServer>>;
let asked: unknown[] = [];
let answer: unknown;
const reply = (translations: unknown[]) => ({
  status: 'completed',
  output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ translations }) }] }],
});
const realFetch = globalThis.fetch;
let providerStatus = 200;

beforeAll(async () => {
  server = await testServer({ OPENAI_API_KEY: 'test-openai-key' });
});

afterAll(() => server.dispose());

beforeEach(() => {
  asked = [];
  answer = reply(['I have a dog.']);
  providerStatus = 200;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) !== 'https://api.openai.com/v1/responses') return realFetch(input, init);
    asked.push(JSON.parse(init!.body as string));
    expect(new Headers(init!.headers).get('Authorization')).toBe('Bearer test-openai-key');
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: providerStatus });
  });
});

afterEach(() => vi.restoreAllMocks());

const translate = (fetcher: typeof fetch, body: unknown) =>
  fetcher('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const today = () => new Date().toISOString().slice(0, 10);
const sentence = 'Ich habe einen Hund.';

describe('readTranslations', () => {
  it('reads one translation per sentence, and nulls the empty ones', () => {
    expect(readTranslations(reply(['  I have\n a dog. ', '', 4]), 3)).toEqual(['I have a dog.', null, null]);
  });

  it('rejects answers that do not line up', () => {
    expect(readTranslations(reply(['one']), 2)).toBeNull();
    expect(readTranslations({ ...reply(['one']), status: 'incomplete' }, 1)).toBeNull();
    expect(readTranslations({ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] }, 1)).toBeNull();
  });
});

describe('/api/translate', () => {
  it('is for accounts only', async () => {
    expect((await translate(server.as(null), { language: 'de', sentences: [sentence] })).status).toBe(401);
    expect(asked).toHaveLength(0);
  });

  it('translates German sentences, in order, with the tested request', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    const response = await translate(fetcher, { language: 'de', sentences: [sentence] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ translations: ['I have a dog.'] });
    expect(asked).toEqual([translationRequest([sentence])]);
    expect(asked[0]).toMatchObject({ model: MODEL, reasoning: { effort: 'low' }, store: false, text: { format: { type: 'json_schema', strict: true } } });
  });

  it('wants German sentences, not too many and not too long', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    expect((await translate(fetcher, { language: 'en', sentences: ['Hello'] })).status).toBe(400);
    expect((await translate(fetcher, { language: 'de', sentences: [] })).status).toBe(400);
    expect((await translate(fetcher, { language: 'de', sentences: ['  '] })).status).toBe(400);
    expect((await translate(fetcher, { language: 'de', sentences: [4] })).status).toBe(400);
    expect((await translate(fetcher, { language: 'de', sentences: Array(TRANSLATE_BATCH + 1).fill(sentence) })).status).toBe(413);
    expect((await translate(fetcher, { language: 'de', sentences: ['a'.repeat(MAX_TRANSLATED + 1)] })).status).toBe(413);
    expect(asked).toHaveLength(0);
  });

  it('answers 502 when the model fails, says nothing usable or loses a sentence', async () => {
    const fetcher = server.as(await server.signUp('ada'));
    answer = new Error('busy');
    expect((await translate(fetcher, { language: 'de', sentences: [sentence] })).status).toBe(502);
    answer = reply(['one', 'two']);
    expect((await translate(fetcher, { language: 'de', sentences: [sentence] })).status).toBe(502);
    providerStatus = 429;
    expect((await translate(fetcher, { language: 'de', sentences: [sentence] })).status).toBe(502);
    expect(asked).toHaveLength(3);
  });

  it('fails without using allowance or calling OpenAI when the key is missing', async () => {
    const token = await server.signUp('ada');
    const savedKey = server.env.OPENAI_API_KEY;
    const used = () => server.env.DB.prepare("SELECT coalesce(sum(count), 0) AS count FROM definition_usage WHERE scope LIKE 'translate:%'").first<{ count: number }>();
    const before = await used();
    server.env.OPENAI_API_KEY = undefined;
    try {
      expect((await translate(server.as(token), { language: 'de', sentences: [sentence] })).status).toBe(503);
      expect(asked).toHaveLength(0);
      expect(await used()).toEqual(before);
    } finally { server.env.OPENAI_API_KEY = savedKey; }
  });

  it('stops an account at its daily allowance, apart from checks', async () => {
    const token = await server.signUp('ada');
    const { user_id: id } = (await server.env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(await sha256(token)).first<{ user_id: string }>())!;
    await server.env.DB.prepare('INSERT INTO definition_usage (day, scope, count) VALUES (?, ?, ?)')
      .bind(today(), `translate:user:${id}`, DAILY_LIMIT.perAccount)
      .run();
    expect((await translate(server.as(token), { language: 'de', sentences: [sentence] })).status).toBe(429);
    expect(asked).toHaveLength(0);
    expect(await server.env.DB.prepare('SELECT count FROM definition_usage WHERE day = ? AND scope = ?').bind(today(), `correct:user:${id}`).first()).toBeNull();
  });
});
