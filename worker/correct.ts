import { type Mark, MAX_TEXT, markMistakes, type Verdict } from '@blitz/core/writing.ts';
import type { Language } from '@blitz/core/word.ts';
import { takeSlot } from './allowance.ts';
import type { User } from './auth.ts';
import { CORRECTION_SCHEMA, messagesFor } from './correction-prompt.ts';
import type { Env } from './env.ts';
import { json, problem } from './http.ts';

export { messagesFor } from './correction-prompt.ts';
export const MODEL = 'gpt-6-luna';
export const MAX_OUTPUT_TOKENS = 4000;
/** Separate from definitions, capped even when the provider fails. No automatic retries. */
export const DAILY_LIMIT = { everyone: 150, perAccount: 30 };

export function correctionRequest(language: Language, text: string) {
  return {
    model: MODEL,
    input: messagesFor(language, text),
    reasoning: { effort: 'low' },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
    text: { format: { type: 'json_schema', name: 'correction', strict: true, schema: CORRECTION_SCHEMA } },
  };
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Read only a completed final answer; reasoning, refusals and partial JSON are never corrections. */
export function readAnswer(answer: unknown): unknown {
  const response = record(answer);
  if (response?.status !== 'completed' || !Array.isArray(response.output)) return null;
  let content = '';
  for (const item of response.output) {
    const message = record(item);
    if (message?.type !== 'message') continue;
    if (message.status !== 'completed' || !Array.isArray(message.content)) return null;
    for (const part of message.content) {
      const block = record(part);
      if (block?.type === 'refusal') return null;
      if (block?.type === 'output_text' && typeof block.text === 'string') content += block.text;
    }
  }
  let value: Record<string, unknown> | null;
  try { value = record(JSON.parse(content)); } catch { return null; }
  if (!value || !['de', 'en', 'other', 'nonsense'].includes(value.language as string) || !Array.isArray(value.mistakes)) return null;
  const mistakes = [];
  for (const item of value.mistakes) {
    const mistake = record(item);
    if (!mistake || typeof mistake.original !== 'string' || !mistake.original.trim() ||
        typeof mistake.replacement !== 'string' || !['spelling', 'grammar'].includes(mistake.kind as string) ||
        typeof mistake.word !== 'string' || typeof mistake.why !== 'string' || !mistake.why.trim()) return null;
    // Keep the application's wire format and grammar history unchanged. A missing replacement
    // must fail validation rather than become an accidental deletion in markMistakes.
    mistakes.push({ wrong: mistake.original, right: mistake.replacement, kind: mistake.kind, word: mistake.word, why: mistake.why });
  }
  return { language: value.language, mistakes };
}

export interface CheckResponse {
  language: Verdict;
  marks: Mark[];
}

/** POST /api/correct: account-only writing checks through OpenAI, with daily and token caps. */
export async function correct(request: Request, env: Env, user: User): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { language?: unknown; text?: unknown } | null;
  const language = body?.language;
  const text = typeof body?.text === 'string' ? body.text.replace(/\r\n?/g, '\n') : '';
  if ((language !== 'de' && language !== 'en') || !text.trim()) return problem(400, 'Expected { language, text }');
  if (text.length > MAX_TEXT) return problem(413, `At most ${MAX_TEXT} characters`);
  if (!env.OPENAI_API_KEY) return problem(503, 'Writing checks are not configured');
  if (!(await takeSlot(env, 'correct', user.id, DAILY_LIMIT))) return problem(429, 'Too many checks today');

  let read: unknown = null;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(correctionRequest(language, text)),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) read = readAnswer(await response.json());
    else console.error('Writing provider HTTP error:', response.status);
  } catch {
    // Do not log the learner's text, provider response, or request headers.
    console.error('Writing provider request failed');
  }
  if (!read) return problem(502, 'The text could not be checked');

  const { language: verdict, marks } = markMistakes(text, read);
  return json({ language: verdict, marks: verdict === language ? marks : [] } satisfies CheckResponse);
}
