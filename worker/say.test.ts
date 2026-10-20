import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VOICES } from '../src/shared/speech/voices.ts';
import { sha256 } from './http.ts';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;

beforeAll(async () => {
  server = await testServer();
});

afterAll(() => server.dispose());

/** The test server is configured with the bucket; the route treats it as optional. */
const bucket = (env: { AUDIO?: R2Bucket }) => env.AUDIO!;

const clipPath = async (language: 'de' | 'en', text: string) => `say/${language}/${await sha256(`${VOICES[language].sha256}\n${text}`)}.wav`;

describe('speech', () => {
  beforeEach(async () => {
    const { objects } = await bucket(server.env).list({ prefix: 'say/' });
    await Promise.all(objects.map((object) => bucket(server.env).delete(object.key)));
  });

  it('needs a language it has a voice for', async () => {
    const response = await server.as(null)('/api/say?language=fr&text=Hund');
    expect(response.status).toBe(400);
  });

  it('needs something to say', async () => {
    const response = await server.as(null)('/api/say?language=de&text=%20%20');
    expect(response.status).toBe(400);
  });

  it('refuses more than a phrase', async () => {
    const response = await server.as(null)(`/api/say?language=de&text=${'a'.repeat(200)}`);
    expect(response.status).toBe(413);
  });

  it('serves a clip already made, to anyone, for a year', async () => {
    const path = await clipPath('de', 'Hund');
    await bucket(server.env).put(path, new Uint8Array([82, 73, 70, 70]), { httpMetadata: { contentType: 'audio/wav' } });
    // No account, no cookie, no Origin: a plain public request.
    const response = await server.as(null)('/api/say?language=de&text=Hund');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]));
  });

  it('normalises what it is asked for, so the same word is one clip', async () => {
    const path = await clipPath('de', 'die Katze');
    await bucket(server.env).put(path, new Uint8Array([1]), { httpMetadata: { contentType: 'audio/wav' } });
    const response = await server.as(null)(`/api/say?language=de&text=${encodeURIComponent('  die   Katze ')}`);
    expect(response.status).toBe(200);
  });

  it('says so when the bucket is missing, instead of throwing', async () => {
    // A preview built before `wrangler r2 bucket create blitz-audio` has no
    // binding for it: the route must answer, not return a 1101.
    const without = await testServer({ AUDIO: undefined, TTS_URL: 'https://tts.test' });
    try {
      const response = await without.as(null)('/api/say?language=de&text=Hund');
      expect(response.status).toBe(503);
    } finally {
      await without.dispose();
    }
  });

  it('says so when there is no speech service', async () => {
    const response = await server.as(null)('/api/say?language=de&text=Niemand');
    expect(response.status).toBe(503);
  });

  it('makes a missing clip when there is one', async () => {
    const asked: unknown[] = [];
    const withService = await testServer({
      TTS_URL: 'https://tts.test',
      TTS_SECRET: 'secret',
    });
    try {
      // The service under test is the network: stand in for it.
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('https://tts.test')) {
          asked.push(JSON.parse(String(init?.body)));
          return new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'Content-Type': 'audio/wav' } });
        }
        return original(input, init);
      }) as typeof fetch;

      const response = await withService.as(null)('/api/say?language=en&text=Cat');
      globalThis.fetch = original;

      expect(response.status).toBe(200);
      expect(asked).toHaveLength(1);
      expect((asked[0] as { text: string }).text).toBe('Cat');
      // Kept, so the next person's copy costs nothing.
      expect(await bucket(withService.env).head(await clipPath('en', 'Cat'))).not.toBeNull();
    } finally {
      await withService.dispose();
    }
  });
});
