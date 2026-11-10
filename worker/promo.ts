import { readPromoEvent, writePromoEvent } from '@martinezharo/promo-funnel/worker';
import { promoFunnel } from '../src/domain/promo.ts';
import type { Env } from './env.ts';
import { problem } from './http.ts';

/**
 * A step of the promo funnel (src/domain/promo.ts), from a visitor who came
 * from a promo for Blitz on RANKMAKER or Backrooms. Counted into the
 * `promo_events` dataset those sites write too, which the private promo-stats
 * dashboard reads. Open to anyone, signed in or not, but only from Blitz's own
 * pages, and nothing about the visitor is kept. The checks and the schema are
 * shared with the other promoted sites (@martinezharo/promo-funnel).
 */
export async function promoEvent(request: Request, env: Env): Promise<Response> {
  const result = await readPromoEvent(request, promoFunnel);
  if (!result.ok) return problem(result.status, result.message);
  writePromoEvent(env.PROMO_ANALYTICS, result.event);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
