import { VOICES } from '../src/shared/speech/voices.ts';
import { problem } from './http.ts';

/** Only the two pinned models can be fetched; no caller-supplied upstream URL. */
export async function voiceModel(request: Request, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const voice = Object.values(VOICES).find((voice) => voice.url === url.pathname);
  if (!voice) return problem(404, 'Voice not found');
  if (request.method !== 'GET' && request.method !== 'HEAD') return problem(405, 'Method not allowed');

  // Ignore query strings and browser headers (cookies, ranges, etc.). Cache
  // complete models under their content hash, never a signed CDN redirect.
  const key = new Request(`${url.origin}${voice.url}`);
  const cache = caches.default;
  const stored = await cache.match(key);
  if (stored) return request.method === 'HEAD' ? new Response(null, stored) : stored;

  try {
    const upstream = await fetch(voice.sourceUrl, { method: request.method, redirect: 'follow' });
    if (upstream.status !== 200 || (request.method === 'GET' && !upstream.body) ||
        Number(upstream.headers.get('Content-Length')) !== voice.bytes) {
      await upstream.body?.cancel();
      return problem(502, 'Voice download failed');
    }
    // Stream the 63 MB model without buffering it in the Worker's memory.
    const response = new Response(upstream.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(voice.bytes),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${voice.sha256}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
    if (request.method === 'GET') {
      const save = cache.put(key, response.clone()).catch(() => {});
      if (ctx) ctx.waitUntil(save);
      else await save;
    }
    return response;
  } catch {
    return problem(502, 'Voice download failed');
  }
}
