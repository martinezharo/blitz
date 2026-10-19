import type { Account } from '@blitz/core/sync.ts';
import { newSession, startGoogleSignIn } from './auth.ts';
import type { Env } from './env.ts';
import { json, problem, randomToken, sha256 } from './http.ts';

/**
 * Signing in from the app.
 *
 * A native app cannot keep an HTTP-only cookie for a year, and Google only
 * redirects to a registered https origin. So the app opens the normal web
 * sign-in in the system browser and asks to be handed a ticket instead:
 *
 *   1. the app makes a verifier, keeps it, and opens
 *      /api/auth/app/start?challenge=sha256(verifier)&scheme=blitz
 *   2. Google's callback finds the pending row and redirects to
 *      blitz://auth?ticket=...  instead of setting a cookie
 *   3. the app posts { ticket, verifier } to /api/auth/app/exchange and gets
 *      the session token it sends as `Authorization: Bearer`.
 *
 * The ticket alone is useless: only the app that made the verifier can spend
 * it, and only once.
 */

const CHALLENGE = /^[0-9a-f]{64}$/;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
/** The custom scheme the app is opened back on. */
const SCHEME = /^[a-z][a-z0-9+.-]{2,62}$/;
const MINUTE = 60 * 1000;

/** GET /api/auth/app/start?challenge=<sha256 of the verifier>&scheme=blitz */
export async function beginAppSignIn(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const challenge = query.get('challenge');
  const scheme = query.get('scheme') ?? 'blitz';
  if (!challenge || !CHALLENGE.test(challenge)) return problem(400, 'Expected a challenge');
  if (!SCHEME.test(scheme)) return problem(400, 'Invalid scheme');

  const state = randomToken();
  await env.DB.prepare('DELETE FROM app_sign_ins WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO app_sign_ins (state_hash, challenge, scheme, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(state), challenge, scheme, Date.now() + 10 * MINUTE)
    .run();
  return startGoogleSignIn(request, env, state);
}

/** POST /api/auth/app/exchange { ticket, verifier } → { token, account } */
export async function exchangeAppTicket(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { ticket?: unknown; verifier?: unknown } | null;
  if (typeof body?.ticket !== 'string' || !TICKET.test(body.ticket)) return problem(400, 'Invalid ticket');
  if (typeof body?.verifier !== 'string' || !TICKET.test(body.verifier)) return problem(400, 'Invalid verifier');

  const row = await env.DB.prepare(
    `DELETE FROM app_sign_ins
     WHERE ticket_hash = ? AND challenge = ? AND expires_at > ? AND user_id IS NOT NULL
     RETURNING user_id`,
  )
    .bind(await sha256(body.ticket), await sha256(body.verifier), Date.now())
    .first<{ user_id: string }>();
  if (!row) return problem(401, 'Ticket expired or already used');

  const token = randomToken();
  await newSession(env, row.user_id, token);
  const user = await env.DB.prepare('SELECT id, email, name, picture FROM users WHERE id = ?')
    .bind(row.user_id)
    .first<Account>();
  return json({ token, account: user });
}
