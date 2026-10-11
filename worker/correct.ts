import { type Mark, MAX_TEXT, markMistakes, type Verdict } from '../src/domain/writing.ts';
import type { Language } from '../src/domain/word.ts';
import { takeSlot } from './allowance.ts';
import type { User } from './auth.ts';
import type { Env } from './env.ts';
import { json, problem } from './http.ts';

/**
 * Checks a text the learner wrote and marks its mistakes.
 *
 * Unlike a definition, this sends what somebody typed to the model, so it is
 * only for accounts, has a length limit and a daily allowance of its own, and
 * the answer is never kept or shown to anyone else. Whatever the model says,
 * only pieces that really are in the text come back marked (markMistakes).
 */

export const MODEL = '@cf/google/gemma-4-26b-a4b-it';
/**
 * Checks per day. A check costs 10 to 20 neurons, the longest texts the most,
 * so even used up this takes about 3,000 of the free 10,000 a day, next to the
 * definitions' 7,000.
 */
export const DAILY_LIMIT = { everyone: 150, perAccount: 30 };

const NAMES: Record<Language, string> = { de: 'German', en: 'English' };

function system(language: Language): string {
  const name = NAMES[language];
  return `You check short texts that adult learners of ${name} write for practice. You find their mistakes; you do not rewrite their text.

WHAT IS A MISTAKE
- "spelling": a word that does not exist as written. A typo, wrong or missing letters, a missing umlaut or ß, a German noun written in lower case.
- "grammar": a real word used wrongly. Wrong ending, case, gender or article, verb form or tense, agreement, word order, a wrong preposition, a missing or extra word.
Only mark what is wrong. A sentence that is correct but could sound nicer is correct: leave style, word choice and punctuation alone. Never mark something only to change it into something else that is also correct.

HOW TO REPORT ONE
- "wrong": the smallest piece of the text that has to change, copied exactly, character for character, with its case. Usually one to three words. For a missing word, include the word next to the gap. For a word in the wrong place, the words that have to move.
- "right": what that whole piece should be instead. It replaces all of "wrong", so it repeats every word of "wrong" that stays: "drei Jahre" becomes "drei Jahren", not "Jahren".
- "kind": "spelling" or "grammar".
- "word": for spelling, the corrected word as a dictionary lists it: a noun in the singular without article (Hunde → Hund), a verb in the infinitive (spielt → spielen), an adjective without ending (schöne → schön). For grammar, "".
- "why": why, in plain English for a beginner, under 90 characters. Name the rule, not just the answer.
List the mistakes in the order they come in the text, each once.

LANGUAGE
Decide first what language the text is written in, from its words, before looking for mistakes. "language" is "de" only for German and "en" only for English. Any other language, such as Spanish, French, Italian or Portuguese, is "other". A text that is not real writing in any language (random letters, keyboard mashing) is "nonsense". The text should be in ${name}; when it is not, give no mistakes.

OUTPUT
JSON only: {"language": "...", "mistakes": [{"wrong": "...", "right": "...", "kind": "...", "word": "...", "why": "..."}]}`;
}

/** One worked example per language, so the model sees how small "wrong" is and what is left alone. */
const EXAMPLES: Record<Language, [string, unknown]> = {
  de: [
    'Gestern ich bin mit meine Freundin ins Kino gegangen. Der Film war sehr spanend und wir haben viel gelacht. Danach wir haben Pizza gegessen in einem kleinen restaurant.',
    {
      language: 'de',
      mistakes: [
        { wrong: 'Gestern ich bin', right: 'Gestern bin ich', kind: 'grammar', word: '', why: 'The verb comes second in a main clause, before the subject' },
        { wrong: 'mit meine', right: 'mit meiner', kind: 'grammar', word: '', why: '"mit" takes the dative: meiner for a feminine noun' },
        { wrong: 'spanend', right: 'spannend', kind: 'spelling', word: 'spannend', why: 'Written with a double n' },
        { wrong: 'Danach wir haben', right: 'Danach haben wir', kind: 'grammar', word: '', why: 'The verb comes second, right after "Danach"' },
        { wrong: 'restaurant', right: 'Restaurant', kind: 'spelling', word: 'Restaurant', why: 'German nouns start with a capital letter' },
      ],
    },
  ],
  en: [
    'Yesterday I go to the park with my freinds. We was playing football for two hours and then we eat sandwiches. It was a really nice day.',
    {
      language: 'en',
      mistakes: [
        { wrong: 'go', right: 'went', kind: 'grammar', word: '', why: 'Yesterday is in the past: use the past simple' },
        { wrong: 'freinds', right: 'friends', kind: 'spelling', word: 'friend', why: 'i before e: friend' },
        { wrong: 'We was', right: 'We were', kind: 'grammar', word: '', why: '"we" takes "were", not "was"' },
        { wrong: 'eat', right: 'ate', kind: 'grammar', word: '', why: 'The story is in the past: use the past simple' },
      ],
    },
  ],
};

export function messagesFor(language: Language, text: string) {
  const [example, answer] = EXAMPLES[language];
  return [
    { role: 'system', content: system(language) },
    { role: 'user', content: example },
    { role: 'assistant', content: JSON.stringify(answer) },
    { role: 'user', content: text },
  ];
}

const ANSWER = {
  type: 'json_schema',
  json_schema: {
    name: 'check',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['de', 'en', 'other', 'nonsense'] },
        mistakes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              wrong: { type: 'string' },
              right: { type: 'string' },
              kind: { type: 'string', enum: ['spelling', 'grammar'] },
              word: { type: 'string' },
              why: { type: 'string' },
            },
            required: ['wrong', 'right', 'kind', 'word', 'why'],
            additionalProperties: false,
          },
        },
      },
      required: ['language', 'mistakes'],
      additionalProperties: false,
    },
  },
};

/** The JSON in the model's answer, or null when there is none. */
export function readAnswer(answer: unknown): unknown {
  const result = answer as { choices?: { message?: { content?: unknown } }[]; response?: unknown } | null;
  const content = result?.choices?.[0]?.message?.content ?? result?.response;
  if (typeof content !== 'string') return typeof content === 'object' ? content : null;
  // The whole answer is the JSON; failing that, from its first brace to its last.
  for (const attempt of [content, content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)]) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Try the next.
    }
  }
  return null;
}

export interface CheckResponse {
  language: Verdict;
  marks: Mark[];
}

/** POST /api/correct { language, text } */
export async function correct(request: Request, env: Env, user: User): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { language?: unknown; text?: unknown } | null;
  const language = body?.language;
  const text = typeof body?.text === 'string' ? body.text.replace(/\r\n?/g, '\n') : '';
  if ((language !== 'de' && language !== 'en') || !text.trim()) return problem(400, 'Expected { language, text }');
  if (text.length > MAX_TEXT) return problem(413, `At most ${MAX_TEXT} characters`);
  if (!(await takeSlot(env, 'correct', user.id, DAILY_LIMIT))) return problem(429, 'Too many checks today');

  let read: unknown = null;
  try {
    const answer = await (env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> }).run(MODEL, {
      messages: messagesFor(language, text),
      max_tokens: 2500,
      temperature: 0.1,
      response_format: ANSWER,
      chat_template_kwargs: { enable_thinking: false },
    });
    read = readAnswer(answer);
    if (!read) console.error('Unusable check:', JSON.stringify(answer)?.slice(0, 300));
  } catch (error) {
    console.error('Workers AI error:', error);
  }
  if (!read) return problem(502, 'The text could not be checked');

  const { language: verdict, marks } = markMistakes(text, read);
  // Another language, or no language at all: nothing in it is worth marking.
  const response: CheckResponse = { language: verdict, marks: verdict === language ? marks : [] };
  return json(response);
}
