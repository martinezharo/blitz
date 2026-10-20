import type { Account } from '@blitz/core/sync.ts';
import type { Env } from './env.ts';
import { APP_PATH, cookie, json, problem, randomToken, readCookie, sessionToken, sha256 } from './http.ts';

const SESSION = 'blitz_session';
const STATE = 'blitz_oauth_state';
const SESSION_DAYS = 365;
const DAY = 24 * 60 * 60;

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

const callbackUrl = (request: Request) => new URL('/api/auth/callback', request.url).toString();

/** Sends the browser to Google's account chooser. */
export function startGoogleSignIn(request: Request, env: Env, state = randomToken()): Response {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return Response.redirect(new URL(`${APP_PATH}?signin=unavailable`, request.url).toString(), 303);
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(request));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return new Response(null, {
    status: 303,
    headers: { Location: url.toString(), 'Set-Cookie': cookie(STATE, state, 600, '/api/auth') },
  });
}

/** The link a native app is opened back on. */
const appLink = (scheme: string, query: string) => `${scheme}://auth${query ? `?${query}` : ''}`;

interface AppSignIn {
  challenge: string;
  scheme: string;
}

const appSignIn = async (env: Env, stateHash: string) =>
  env.DB.prepare('SELECT challenge, scheme FROM app_sign_ins WHERE state_hash = ? AND expires_at > ? AND ticket_hash IS NULL')
    .bind(stateHash, Date.now())
    .first<AppSignIn>();

/** Google's redirect back: trade the code for an identity and open a session. */
export async function finishGoogleSignIn(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const clearState = cookie(STATE, '', 0, '/api/auth');
  const state = url.searchParams.get('state');
  const stateHash = state ? await sha256(state) : null;
  // Where the person ends up: back in the app that asked, or in the web app.
  const app = stateHash ? await appSignIn(env, stateHash) : null;
  const home = (outcome?: string) =>
    app
      ? appLink(app.scheme, outcome ? `error=${encodeURIComponent(outcome)}` : '')
      : new URL(outcome ? `${APP_PATH}?signin=${outcome}` : APP_PATH, request.url).toString();
  const fail = (outcome: string) =>
    new Response(null, { status: 303, headers: { Location: home(outcome), 'Set-Cookie': clearState } });

  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') === 'access_denied') return fail('cancelled');
  if (!code || !state || state !== readCookie(request, STATE)) return fail('failed');

  const profile = await googleProfile(code, callbackUrl(request), env);
  if (!profile) return fail('failed');

  const user = await upsertUser(env, profile);

  // An app waiting on a custom-scheme link gets a single-use ticket: it has no
  // cookie jar, and the ticket is useless without the verifier it kept.
  if (app && stateHash) {
    const ticket = randomToken();
    await env.DB.prepare(
      'UPDATE app_sign_ins SET ticket_hash = ?, user_id = ?, expires_at = ? WHERE state_hash = ? AND ticket_hash IS NULL',
    ).bind(await sha256(ticket), user.id, Date.now() + 5 * 60 * 1000, stateHash).run();
    return new Response(null, {
      status: 303,
      headers: { Location: appLink(app.scheme, `ticket=${ticket}`), 'Set-Cookie': clearState, 'Referrer-Policy': 'no-referrer' },
    });
  }

  const transfer = await env.DB.prepare(
    'SELECT origin FROM dev_sign_ins WHERE state_hash = ? AND expires_at > ? AND ticket_hash IS NULL',
  ).bind(stateHash!, Date.now()).first<{ origin: string }>();
  if (transfer) {
    const ticket = randomToken();
    await env.DB.prepare(
      'UPDATE dev_sign_ins SET ticket_hash = ?, user_id = ?, expires_at = ? WHERE state_hash = ? AND ticket_hash IS NULL',
    ).bind(await sha256(ticket), user.id, Date.now() + 5 * 60 * 1000, stateHash!).run();
    const destination = new URL('/api/auth/dev/finish', transfer.origin);
    destination.searchParams.set('ticket', ticket);
    return new Response(null, {
      status: 303,
      headers: { Location: destination.toString(), 'Set-Cookie': clearState, 'Referrer-Policy': 'no-referrer' },
    });
  }
  const token = randomToken();
  await newSession(env, user.id, token);

  const headers = new Headers({ Location: home() });
  headers.append('Set-Cookie', clearState);
  headers.append('Set-Cookie', cookie(SESSION, token, SESSION_DAYS * DAY));
  return new Response(null, { status: 303, headers });
}

export async function newSession(env: Env, userId: string, token: string): Promise<void> {
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * DAY * 1000)
    .run();
}

interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/**
 * The ID token comes straight from Google's token endpoint over TLS, so its
 * signature does not need checking (Google's OpenID guide says as much); the
 * audience and issuer still are.
 */
async function googleProfile(code: string, redirectUri: string, env: Env): Promise<GoogleProfile | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    console.error('Google token exchange failed', response.status, await response.text());
    return null;
  }
  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  // Base64url of UTF-8: names like "Martínez" must survive the decode.
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
  const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  const issuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!issuer || claims.aud !== env.GOOGLE_CLIENT_ID || typeof claims.sub !== 'string') return null;
  if (typeof claims.email !== 'string' || claims.email_verified !== true) return null;
  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' ? claims.name : null,
    picture: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

async function upsertUser(env: Env, profile: GoogleProfile): Promise<User> {
  // Name and picture follow the Google account; the id never changes.
  return (await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture
     RETURNING id, email, name, picture`,
  )
    .bind(crypto.randomUUID(), profile.sub, profile.email, profile.name, profile.picture, Date.now())
    .first<User>())!;
}

export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = sessionToken(request, SESSION);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT users.id, users.email, users.name, users.picture FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<User>();
}

export async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  const account: Account | null = user && { id: user.id, email: user.email, name: user.name, picture: user.picture };
  return json({ account });
}

export async function signOut(request: Request, env: Env): Promise<Response> {
  const token = sessionToken(request, SESSION);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, { headers: { 'Set-Cookie': cookie(SESSION, '', 0) } });
}

/**
 * Deletes the account and everything in it: words, corrections, days, photos
 * and sessions. Both app stores ask for this to be reachable from inside the
 * app, and it cannot be undone, so the client asks twice.
 */
export async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return problem(401, 'Not signed in');

  // Photos go first: a failure here would leave files nothing points at.
  let cursor: string | undefined;
  do {
    const listed = await env.PHOTOS.list({ prefix: `${user.id}/`, cursor });
    await Promise.all(listed.objects.map((object) => env.PHOTOS.delete(object.key)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM words WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM dev_sign_ins WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM app_sign_ins WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);

  return json({ ok: true }, { headers: { 'Set-Cookie': cookie(SESSION, '', 0) } });
}
