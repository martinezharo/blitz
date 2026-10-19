import { VOICES } from '../src/shared/speech/voices.ts';
import type { Env } from './env.ts';
import { json, problem, sha256 } from './http.ts';

/**
 * Words read aloud, made once for everybody.
 *
 * The web app runs Piper in the browser, which costs every device a 63 MB
 * download per language. A phone should not carry that, so the app asks for a
 * clip instead: the Worker looks it up in R2 under the hash of the voice and
 * the text, and on a miss asks the Piper container to make it and keeps it.
 *
 * A word is made once in the lifetime of the service, for every learner, and
 * R2 charges nothing to serve it. Same voice, same parameters and same tidying
 * as the browser, so a word sounds the same wherever it is heard.
 */

/** Longer than any word or short phrase a lesson says. */
export const MAX_SAY_TEXT = 120;
/** How many words a lesson may ask to have made ahead of time. */
export const MAX_PREPARE = 20;

const AUDIO_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
};

const spoken = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ');
const clipPath = async (language: 'de' | 'en', text: string) =>
  `say/${language}/${await sha256(`${VOICES[language].sha256}\n${text}`)}.wav`;

/** The clip, made and kept if it was not made yet. Null when it cannot be made. */
async function clip(env: Env, language: 'de' | 'en', text: string): Promise<Response | null> {
  const path = await clipPath(language, text);
  const stored = await env.AUDIO.get(path);
  if (stored) {
    return new Response(stored.body, {
      headers: { ...AUDIO_HEADERS, 'Content-Type': stored.httpMetadata?.contentType ?? 'audio/wav', 'Content-Length': String(stored.size) },
    });
  }
  if (!env.TTS_URL) return null;

  let made: Response;
  try {
    const voice = VOICES[language];
    made = await fetch(new URL('/say', env.TTS_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TTS_SECRET ?? ''}` },
      body: JSON.stringify({
        text,
        voice: {
          model: voice.sourceUrl,
          espeak: voice.espeak,
          sampleRate: voice.sampleRate,
          noiseScale: voice.noiseScale,
          lengthScale: voice.lengthScale,
          noiseW: voice.noiseW,
        },
      }),
    });
  } catch (error) {
    console.error('Speech service failed:', error);
    return null;
  }
  if (!made.ok) {
    console.error('Speech service answered', made.status);
    return null;
  }

  const bytes = await made.arrayBuffer();
  const contentType = made.headers.get('Content-Type') ?? 'audio/wav';
  await env.AUDIO.put(path, bytes, { httpMetadata: { contentType } }).catch(() => {});
  return new Response(bytes, { headers: { ...AUDIO_HEADERS, 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength) } });
}

/** GET /api/say?language=de&text=Hund — public, no account, no database. */
export async function say(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const language = query.get('language');
  const text = spoken(query.get('text') ?? '');
  if (language !== 'de' && language !== 'en') return problem(400, 'Expected a language');
  if (!text) return problem(400, 'Expected a text');
  if (text.length > MAX_SAY_TEXT) return problem(413, `At most ${MAX_SAY_TEXT} characters`);

  if (request.method === 'HEAD') {
    const path = await clipPath(language, text);
    const stored = await env.AUDIO.head(path);
    return stored ? new Response(null, { headers: { ...AUDIO_HEADERS, 'Content-Type': stored.httpMetadata?.contentType ?? 'audio/wav' } }) : problem(404, 'Not made yet');
  }

  const made = await clip(env, language, text);
  if (!made) return env.TTS_URL ? problem(502, 'The voice could not be made') : problem(503, 'Speech is not set up on this server yet');
  return made;
}

/**
 * POST /api/say/prepare { language, texts } — the words of a lesson, made
 * while the first question is being read, so they are instant when needed.
 * It answers without waiting; the clips come from /api/say.
 */
export async function prepareSpeech(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { language?: unknown; texts?: unknown } | null;
  const language = body?.language;
  if (language !== 'de' && language !== 'en') return problem(400, 'Expected a language');
  if (!Array.isArray(body?.texts)) return problem(400, 'Expected texts');
  if (!env.TTS_URL) return problem(503, 'Speech is not set up on this server yet');

  const texts = [...new Set(
    body.texts
      .filter((text): text is string => typeof text === 'string')
      .map(spoken)
      .filter((text) => text && text.length <= MAX_SAY_TEXT),
  )].slice(0, MAX_PREPARE);

  // One at a time: the container is a single small process, and a lesson only
  // needs a handful of words. The promise outlives the response.
  const work = (async () => {
    for (const text of texts) {
      const path = await clipPath(language, text);
      if (await env.AUDIO.head(path)) continue;
      await clip(env, language, text);
    }
  })();
  if (ctx) ctx.waitUntil(work);
  else await work;
  return json({ queued: texts.length });
}
