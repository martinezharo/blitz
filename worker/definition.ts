import { checkDefinition, DEFINITION_STYLE } from '../src/domain/definition-style.ts';
import { type DictEntry, type DictSense, normalize, SENSE_TYPE_OF, shardKey } from '../src/domain/dictionary.ts';
import type { WordType } from '../src/domain/word.ts';
import { takeSlot } from './allowance.ts';
import { currentUser } from './auth.ts';
import type { Env } from './env.ts';
import { json, problem, sha256 } from './http.ts';

/**
 * A definition for a dictionary meaning that has none worth showing.
 *
 * The dictionary holds written-for-learners definitions for the most common
 * words (scripts/curate-dictionary.ts). For the rest, a small model writes one
 * the first time somebody picks the meaning, and it is kept for everyone.
 *
 * The browser never sends text for the model to read: it names a word, and the
 * Worker looks that word up in the dictionary itself. A word the dictionary
 * does not have gets nothing, so nobody can use this to talk to the model or
 * to put words in the shared cache.
 */

export const MODEL = '@cf/google/gemma-4-26b-a4b-it';
/** Bumped when the instructions change enough to want the definitions written again. */
export const PROMPT_VERSION = 2;
/**
 * What the model may be asked for per day. About 7 neurons each, so the whole
 * allowance stays inside the 10,000 neurons Workers AI gives for free.
 */
export const DAILY_LIMIT = { everyone: 1000, perAccount: 100 };

const SYSTEM = `You write the short English definition that a language-learning app shows under a word the learner is saving. The learner is an adult beginner or intermediate who reads English.

WHAT TO DEFINE
Define the exact sense given by the word's type and, for German words, its English translation. The translation is the ground truth for the meaning. A dictionary hint is attached for context, but it is often about a different sense, too technical, or plainly wrong (for example, the hint for a word meaning "mouth" may describe "a person"). Use the hint only when it agrees with the translation; otherwise ignore it and rely on your own knowledge of the word. If the translation lists several unrelated meanings, define only the first one.

STYLE
${DEFINITION_STYLE}

OUTPUT
Reply with JSON only, exactly: {"definition": "..."}`;

interface Meaning {
  language: 'de' | 'en';
  term: string;
  type: WordType;
  article: string | null;
  translation: string | null;
  hint: string | null;
  /** The dictionary already has a definition written for learners. */
  written?: string | null;
}

function describe(meaning: Meaning): string {
  const lines = [
    `Language: ${meaning.language === 'de' ? 'German' : 'English'}`,
    `Word: ${meaning.article ? `${meaning.article} ` : ''}${meaning.term}`,
    `Type: ${meaning.type}`,
  ];
  if (meaning.translation) lines.push(`English translation: ${meaning.translation}`);
  lines.push(`Dictionary hint (may be wrong or too technical): ${meaning.hint ?? '(none)'}`);
  return lines.join('\n');
}

/** Words the model has not seen in the instructions, to show it the style and the traps. */
const EXAMPLES: [Meaning, string][] = [
  [{ language: 'de', term: 'Tisch', type: 'noun', article: 'der', translation: 'table', hint: 'A piece of furniture with a flat top, usually standing on legs' }, 'A piece of furniture with a flat top and legs'],
  [{ language: 'de', term: 'Niere', type: 'noun', article: 'die', translation: 'kidney', hint: 'Either of a pair of organs in vertebrates that filter blood, regulate electrolytes and excrete urine' }, 'The organ in the body that cleans the blood and makes urine'],
  [{ language: 'de', term: 'Fuchs', type: 'noun', article: 'der', translation: 'fox', hint: 'A person who is cunning or sly' }, 'A wild animal like a small dog, with red-brown fur and a bushy tail'],
  [{ language: 'de', term: 'schwimmen', type: 'verb', article: null, translation: 'to swim, to float', hint: 'To move through water by moving the limbs' }, 'To move through water using your arms and legs'],
  [{ language: 'de', term: 'hell', type: 'adjective', article: null, translation: 'bright, light, pale', hint: 'Having a high luminosity or albedo' }, 'Full of light, or light in colour'],
  [{ language: 'de', term: 'Gabel', type: 'noun', article: 'die', translation: 'fork', hint: null }, 'A tool with points, used to pick up food and eat'],
  [{ language: 'en', term: 'bridge', type: 'noun', article: null, translation: null, hint: 'A structure carrying a road, path, or railway across a river, road, or other obstacle' }, 'A structure that lets people or vehicles cross a river or a road'],
];

export function messagesFor(meaning: Meaning) {
  return [
    { role: 'system', content: SYSTEM },
    ...EXAMPLES.flatMap(([example, answer]) => [
      { role: 'user', content: describe(example) },
      { role: 'assistant', content: JSON.stringify({ definition: answer }) },
    ]),
    { role: 'user', content: describe(meaning) },
  ];
}

const ANSWER = {
  type: 'json_schema',
  json_schema: {
    name: 'definition',
    strict: true,
    schema: { type: 'object', properties: { definition: { type: 'string' } }, required: ['definition'], additionalProperties: false },
  },
};

/** The definition in the model's answer, tidied, or null when it is not one worth keeping. */
export function readDefinition(answer: unknown): string | null {
  const result = answer as { choices?: { message?: { content?: unknown } }[]; response?: unknown } | null;
  const content = result?.choices?.[0]?.message?.content ?? result?.response;
  let value: unknown;
  if (typeof content === 'string') {
    // The whole answer is the JSON; failing that, the first object in it (models sometimes add words around it).
    const attempts = [content, content.match(/\{[^{}]*\}/)?.[0] ?? ''];
    for (const attempt of attempts) {
      try {
        value = (JSON.parse(attempt) as { definition?: unknown }).definition;
        break;
      } catch {
        // Try the next.
      }
    }
  } else {
    value = (content as { definition?: unknown } | undefined)?.definition;
  }
  const checked = checkDefinition(value);
  return 'definition' in checked ? checked.definition : null;
}

/** The meaning of the dictionary that the request names, or null if the dictionary has none like it. */
async function findMeaning(request: Request, env: Env, query: URLSearchParams): Promise<Meaning | null> {
  const language = query.get('language');
  const term = (query.get('term') ?? '').trim();
  const type = query.get('type');
  if ((language !== 'de' && language !== 'en') || !term || term.length > 40) return null;
  const sense = type ? SENSE_TYPE_OF[type as WordType] : undefined;
  if (!sense) return null;

  const url = new URL(`/dict/${language}/${shardKey(normalize(term))}.json`, request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  // A path the app does not have is answered with its own page.
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
  const entry = ((await response.json()) as DictEntry[]).find((candidate) => candidate.w === term);
  if (!entry) return null;

  const article = query.get('article') || null;
  const translation = query.get('translation') || null;
  const hint = query.get('hint') || null;
  const matching = entry.s.filter((candidate) => candidate.t === sense && (language === 'en' || (candidate.a ?? null) === article));
  const picked: DictSense | undefined =
    matching.find((candidate) => translation && candidate.g?.join(', ') === translation) ??
    matching.find((candidate) => hint && candidate.d === hint) ??
    matching[0];
  if (!picked) return null;
  return {
    language,
    term: entry.w,
    type: type as WordType,
    article: picked.a ?? null,
    translation: picked.g?.join(', ') ?? null,
    hint: picked.d ?? null,
    written: picked.c ? (picked.d ?? null) : null,
  };
}

/** GET /api/definition?language=&term=&type=&article=&translation=&hint= */
export async function definition(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const meaning = await findMeaning(request, env, query);
  if (!meaning) return problem(404, 'Not a word of the dictionary');
  // Already written for learners, and in the dictionary: nothing to ask the model.
  if (meaning.written) return json({ definition: meaning.written });

  const key = await sha256(
    [meaning.language, normalize(meaning.term), meaning.type, meaning.article ?? '', normalize(meaning.translation ?? ''), normalize(meaning.hint ?? '')].join('|'),
  );
  const stored = () => env.DB.prepare('SELECT definition FROM definitions WHERE key = ?').bind(key).first<{ definition: string }>();
  const known = await stored();
  if (known) return json({ definition: known.definition });

  // Writing costs the allowance, and a GET carries the cookie from other sites too.
  const origin = request.headers.get('Sec-Fetch-Site');
  if (origin && origin !== 'same-origin' && origin !== 'none') return problem(403, 'Cross-site request');
  const user = await currentUser(request, env);
  if (!user) return problem(401, 'Sign in to have a definition written');
  if (!(await takeSlot(env, null, user.id, DAILY_LIMIT))) return problem(429, 'Too many definitions today');

  let written: string | null = null;
  try {
    // Switching thinking off costs a seventh and answers in a second, for a task this small.
    const answer = await (env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> }).run(MODEL, {
      messages: messagesFor(meaning),
      max_tokens: 200,
      temperature: 0.2,
      response_format: ANSWER,
      chat_template_kwargs: { enable_thinking: false },
    });
    written = readDefinition(answer);
    if (!written) console.error('Unusable definition:', JSON.stringify(answer)?.slice(0, 300));
  } catch (error) {
    console.error('Workers AI error:', error);
  }
  if (!written) return problem(502, 'No definition could be written');

  // Two people may ask at once: the first one stays, and both get it.
  await env.DB.prepare('INSERT OR IGNORE INTO definitions (key, language, term, type, definition, model, prompt_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(key, meaning.language, meaning.term, meaning.type, written, MODEL, PROMPT_VERSION, Date.now())
    .run();
  return json({ definition: (await stored())?.definition ?? written });
}
