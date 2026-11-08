import { parsePromoEvent, PROMO_NAME } from '../src/domain/promo.ts';
import type { Env } from './env.ts';
import { problem } from './http.ts';

/** A promo event is six short fields; anything bigger is not one. */
export const MAX_PROMO_BYTES = 256;

/** The body, or null once it is longer than `limit` bytes, read no further. */
async function readBounded(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * A step of the promo funnel (src/shared/promo.ts), from a visitor who came
 * from a promo for Blitz on RANKMAKER or Backrooms. Counted into the
 * `promo_events` dataset those sites write too, which the private promo-stats
 * dashboard reads. Open to anyone, signed in or not, but only from Blitz's own
 * pages (the Worker checks the Origin before routing here), and nothing about
 * the visitor is kept.
 */
export async function promoEvent(request: Request, env: Env): Promise<Response> {
  const type = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (type !== 'application/json') return problem(415, 'Expected application/json');
  const text = await readBounded(request, MAX_PROMO_BYTES);
  if (text === null) return problem(413, `At most ${MAX_PROMO_BYTES} bytes`);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return problem(400, 'Invalid JSON');
  }
  const event = parsePromoEvent(value);
  if (!event) return problem(400, 'Invalid promo event');

  // Schema, shared with the other sites: event, source, promo, placement, language, wording.
  env.PROMO_ANALYTICS.writeDataPoint({
    blobs: [event.event, event.source, event.promo, event.placement, event.locale, event.variant],
    doubles: [1],
    indexes: [PROMO_NAME],
  });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
