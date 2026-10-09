import type { Env } from './env.ts';
import { cookie, json, problem, randomToken, readCookie, sameOrigin, sha256 } from './http.ts';
import { startGoogleSignIn } from './auth.ts';

const VERIFIER = 'blitz_dev_verifier';
const SESSION = 'blitz_session';
const FIVE_MINUTES = 5 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[0-9a-f]{64}$/;

async function signature(secret: string, origin: string, challenge: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${origin}\n${challenge}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validSignature(secret: string, origin: string, challenge: string, supplied: string): Promise<boolean> {
  if (!HASH.test(supplied)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(supplied.match(/../g)!, (pair) => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${origin}\n${challenge}`));
}

function upstream(env: Env, localOrigin: string): URL | null {
  try {
    const url = new URL(env.DEVELOPMENT_UPSTREAM!);
    return url.protocol === 'https:' && url.origin !== localOrigin && url.pathname === '/' && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}

/** Local development: keep the verifier in an HTTP-only cookie, then visit production. */
export async function beginLocalSignIn(request: Request, env: Env): Promise<Response> {
  const local = new URL(request.url);
  const remote = upstream(env, local.origin);
  if (!remote || !env.DEVELOPMENT_BRIDGE_SECRET ||
      local.protocol !== 'https:' && !(local.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(local.hostname))) {
    return problem(503, 'Development sign-in needs a secure origin, HTTPS upstream, and bridge secret');
  }
  const verifier = randomToken();
  const challenge = await sha256(verifier);
  const destination = new URL('/api/auth/dev/start', remote);
  destination.searchParams.set('origin', local.origin);
  destination.searchParams.set('challenge', challenge);
  destination.searchParams.set('signature', await signature(env.DEVELOPMENT_BRIDGE_SECRET, local.origin, challenge));
  return new Response(null, {
    status: 303,
    headers: { Location: destination.toString(), 'Set-Cookie': cookie(VERIFIER, verifier, 300, '/api/auth/dev'), 'Cache-Control': 'no-store' },
  });
}

/** Production: Google still sees only its registered production callback. */
export async function beginProductionSignIn(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.searchParams.get('origin');
  const challenge = url.searchParams.get('challenge');
  const signed = url.searchParams.get('signature');
  if (!origin || !challenge || !HASH.test(challenge) || !signed || !env.DEVELOPMENT_BRIDGE_SECRET ||
      !await validSignature(env.DEVELOPMENT_BRIDGE_SECRET, origin, challenge, signed)) {
    return problem(400, 'Invalid development sign-in');
  }
  let local: URL;
  try { local = new URL(origin); } catch { return problem(400, 'Invalid development origin'); }
  if (local.origin !== origin || local.protocol !== 'https:' &&
      !(local.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(local.hostname))) {
    return problem(400, 'Development origin must be secure');
  }
  const state = randomToken();
  await env.DB.prepare('DELETE FROM dev_sign_ins WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare(
    'INSERT INTO dev_sign_ins (state_hash, origin, challenge, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(await sha256(state), origin, challenge, Date.now() + FIVE_MINUTES).run();
  return startGoogleSignIn(request, env, state);
}

/** Production: consume the ticket atomically and create a regular session. */
export async function exchangeTicket(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { ticket?: unknown; verifier?: unknown } | null;
  if (typeof body?.ticket !== 'string' || !TOKEN.test(body.ticket) ||
      typeof body.verifier !== 'string' || !TOKEN.test(body.verifier)) return problem(400, 'Invalid ticket');
  const row = await env.DB.prepare(
    `DELETE FROM dev_sign_ins WHERE ticket_hash = ? AND challenge = ?
     AND expires_at > ? AND user_id IS NOT NULL RETURNING user_id`,
  ).bind(await sha256(body.ticket), await sha256(body.verifier), Date.now()).first<{ user_id: string }>();
  if (!row) return problem(401, 'Ticket expired or already used');
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), row.user_id, Date.now() + 365 * 24 * 60 * 60 * 1000).run();
  return json({ token });
}

/** Local development: exchange server-to-server and set the usual HTTP-only cookie. */
export async function finishLocalSignIn(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const ticket = url.searchParams.get('ticket');
  const verifier = readCookie(request, VERIFIER);
  const remote = upstream(env, url.origin);
  const home = new URL('/', url);
  if (!remote || !ticket || !TOKEN.test(ticket) || !verifier || !TOKEN.test(verifier)) {
    home.searchParams.set('signin', 'failed');
    return Response.redirect(home.toString(), 303);
  }
  const response = await fetch(new URL('/api/auth/dev/exchange', remote), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, verifier }),
  });
  if (!response.ok) home.searchParams.set('signin', 'failed');
  const token = response.ok ? (await response.json() as { token: string }).token : null;
  const headers = new Headers({ Location: home.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  headers.append('Set-Cookie', cookie(VERIFIER, '', 0, '/api/auth/dev'));
  if (token) headers.append('Set-Cookie', cookie(SESSION, token, 365 * 24 * 60 * 60));
  return new Response(null, { status: 303, headers });
}

/** Local development: the browser keeps a local cookie; only this Worker contacts production. */
export async function proxyAccountRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) return problem(403, 'Cross-origin request');
  const local = new URL(request.url);
  const remote = upstream(env, local.origin);
  if (!remote) return problem(503, 'Invalid DEVELOPMENT_UPSTREAM');
  const target = new URL(local.pathname + local.search, remote);
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  const token = readCookie(request, SESSION);
  if (token) headers.set('Cookie', `${SESSION}=${token}`);
  headers.set('Origin', remote.origin);
  const result = await fetch(target, {
    method: request.method, headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer(),
    redirect: 'manual',
  });
  const responseHeaders = new Headers(result.headers);
  responseHeaders.delete('Set-Cookie');
  if (local.pathname === '/api/auth/sign-out') responseHeaders.append('Set-Cookie', cookie(SESSION, '', 0));
  return new Response(result.body, { status: result.status, headers: responseHeaders });
}
