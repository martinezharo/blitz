import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from './http.ts';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;

beforeAll(async () => {
  server = await testServer();
});

afterAll(() => server.dispose());

/** Shaped like the Worker's own tokens: 43 base64url characters. */
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const challengeOf = (value: string) => sha256(value);
/** Shaped like the Worker's own tokens: 43 base64url characters. */
const TICKET = `${'a'.repeat(43)}`;

/** What Google's callback does once it has a user: leave a ticket for the app. */
async function pendingTicket(scheme = 'blitz') {
  const state = `state-${crypto.randomUUID()}`;
  const verifierValue = token();
  const userId = crypto.randomUUID();
  await server.env.DB.prepare('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, `sub-${userId}`, 'app@example.com', 'App', Date.now())
    .run();
  await server.env.DB.prepare('INSERT INTO app_sign_ins (state_hash, challenge, scheme, ticket_hash, user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(state), await challengeOf(verifierValue), scheme, await sha256(TICKET), userId, Date.now() + 60_000)
    .run();
  return { verifier: verifierValue, state };
}

describe('signing in from the app', () => {
  it('asks for a challenge before sending anyone to Google', async () => {
    const response = await server.asApp(null)('/api/auth/app/start?scheme=blitz');
    expect(response.status).toBe(400);
  });

  it('refuses a scheme that is not one', async () => {
    const response = await server.asApp(null)(`/api/auth/app/start?challenge=${'a'.repeat(64)}&scheme=not%20a%20scheme`);
    expect(response.status).toBe(400);
  });

  it('sends the browser to Google and remembers the challenge', async () => {
    const challenge = 'b'.repeat(64);
    const response = await server.asApp(null)(`/api/auth/app/start?challenge=${challenge}&scheme=blitz`, { redirect: 'manual' });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('accounts.google.com');
    const { results } = await server.env.DB.prepare('SELECT challenge, scheme FROM app_sign_ins').all<{ challenge: string; scheme: string }>();
    expect(results.some((row) => row.challenge === challenge && row.scheme === 'blitz')).toBe(true);
  });

  it('spends a ticket once, and only with its verifier', async () => {
    const { verifier: made } = await pendingTicket();
    const wrong = await server.asApp(null)('/api/auth/app/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: TICKET, verifier: 'x'.repeat(43) }),
    });
    expect(wrong.status).toBe(401);

    const response = await server.asApp(null)('/api/auth/app/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: TICKET, verifier: made }),
    });
    expect(response.status).toBe(200);
    const { token, account } = (await response.json()) as { token: string; account: { email: string } };
    expect(account.email).toBe('app@example.com');
    expect(token).toHaveLength(43);

    // A native client sends no Origin, and its token is not a cookie.
    const me = await server.asApp(token)('/api/me');
    expect(await me.json()).toMatchObject({ account: { email: 'app@example.com' } });

    // The same ticket again is gone.
    const again = await server.asApp(null)('/api/auth/app/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: TICKET, verifier: made }),
    });
    expect(again.status).toBe(401);
  });

  it('writes with a bearer token and no Origin at all', async () => {
    const token = await server.signUp('bearer');
    const response = await server.asApp(token)('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: 0, changes: [] }),
    });
    expect(response.status).toBe(200);
  });

  it('still refuses a web request from another origin', async () => {
    const token = await server.signUp('origin');
    const response = await server.as(token)('/api/sync', {
      method: 'POST',
      headers: { Origin: 'https://evil.test' },
      body: '{"cursor":0,"changes":[]}',
    });
    expect(response.status).toBe(403);
  });
});

describe('deleting the account', () => {
  it('needs a session', async () => {
    const response = await server.as(null)('/api/account', { method: 'DELETE' });
    expect(response.status).toBe(401);
  });

  it('takes the words, the sessions and the photos with it', async () => {
    const token = await server.signUp('gone');
    const me = (await (await server.as(token)('/api/me')).json()) as { account: { id: string } };
    const id = me.account.id;
    await server.as(token)('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cursor: 0,
        changes: [{ id: crypto.randomUUID(), updatedAt: 1, word: null }],
      }),
    });
    await server.env.PHOTOS.put(`${id}/${'a'.repeat(64)}`, new Uint8Array([1, 2, 3]));

    const response = await server.as(token)('/api/account', { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(await server.env.DB.prepare('SELECT COUNT(*) AS n FROM words WHERE user_id = ?').bind(id).first<{ n: number }>()).toMatchObject({ n: 0 });
    expect(await server.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').bind(id).first<{ n: number }>()).toMatchObject({ n: 0 });
    expect(await (await server.as(token)('/api/me')).json()).toMatchObject({ account: null });
    expect((await server.env.PHOTOS.list({ prefix: `${id}/` })).objects).toHaveLength(0);
  });
});
