import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from './index.ts';
import { randomToken, sha256 } from './http.ts';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;

beforeAll(async () => { server = await testServer(); });
afterAll(() => server.dispose());

const origin = 'http://localhost:8765';
async function start(challenge: string, devOrigin = origin, signed = true) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-bridge-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${devOrigin}\n${challenge}`));
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return server.as(null)(`/api/auth/dev/start?origin=${encodeURIComponent(devOrigin)}&challenge=${challenge}${signed ? `&signature=${signature}` : ''}`);
}

describe('development sign-in', () => {
  it('accepts any localhost port but rejects external return origins', async () => {
    const challenge = await sha256(randomToken());
    expect((await start(challenge)).status).toBe(303);
    expect((await start(challenge, origin, false)).status).toBe(400);
    expect((await start(challenge, 'http://evil.example')).status).toBe(400);
    expect((await start(challenge, 'https://trusted-preview.example')).status).toBe(303);
    expect((await start(challenge, 'http://localhost.evil.example')).status).toBe(400);
  });

  it('binds the single-use ticket to the initiating verifier', async () => {
    const verifier = randomToken();
    const response = await start(await sha256(verifier));
    const google = new URL(response.headers.get('Location')!);
    const state = google.searchParams.get('state')!;
    const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!;
    const originalFetch = globalThis.fetch;
    const claims = { iss: 'https://accounts.google.com', aud: 'client', sub: randomToken(), email: 'ada@example.com', email_verified: true };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id_token: `x.${btoa(JSON.stringify(claims))}.x` })));
    let callback: Response;
    try {
      callback = await server.as(null)(`/api/auth/callback?state=${state}&code=google-code`, { headers: { Cookie: cookie } });
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
    expect(callback.status).toBe(303);
    const destination = new URL(callback.headers.get('Location')!);
    expect(destination.origin).toBe(origin);
    const ticket = destination.searchParams.get('ticket')!;
    const exchange = (proof: string) => worker.fetch(new Request('https://blitz.test/api/auth/dev/exchange', {
      method: 'POST', body: JSON.stringify({ ticket, verifier: proof }),
    }) as never, server.env);
    expect((await exchange(randomToken())).status).toBe(401);
    const redeemed = await exchange(verifier);
    expect(redeemed.status).toBe(200);
    const { token } = await redeemed.json() as { token: string };
    expect((await server.as(token)('/api/me').then((r) => r.json()) as { account: { email: string } }).account.email).toBe('ada@example.com');
    expect((await exchange(verifier)).status).toBe(401);
  });

  it('sends a failed sign-in back to the app, not the front page', async () => {
    const response = await server.as(null)('/api/auth/callback?state=forged&code=google-code');
    expect(response.status).toBe(303);
    const destination = new URL(response.headers.get('Location')!);
    expect(destination.pathname).toBe('/learn');
    expect(destination.searchParams.get('signin')).toBe('failed');
  });

  it('tells the app that a sign-in went through, so it can count it', async () => {
    const response = await server.as(null)('/api/auth/google');
    const state = new URL(response.headers.get('Location')!).searchParams.get('state')!;
    const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!;
    const originalFetch = globalThis.fetch;
    const claims = { iss: 'https://accounts.google.com', aud: 'client', sub: randomToken(), email: 'grace@example.com', email_verified: true };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id_token: `x.${btoa(JSON.stringify(claims))}.x` })));
    let callback: Response;
    try {
      callback = await server.as(null)(`/api/auth/callback?state=${state}&code=google-code`, { headers: { Cookie: cookie } });
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
    expect(callback.status).toBe(303);
    const destination = new URL(callback.headers.get('Location')!);
    expect(destination.pathname).toBe('/learn');
    expect(destination.searchParams.get('signin')).toBe('ok');
  });

  it('rejects browser calls to the ticket exchange', async () => {
    const response = await server.as(null)('/api/auth/dev/exchange', { method: 'POST', body: '{}' });
    expect(response.status).toBe(403);
  });

  it('starts on a new port and proxies the production account and sign-out', async () => {
    const localEnv = { ...server.env, DEVELOPMENT_UPSTREAM: 'https://blitz.test' };
    const begin = await worker.fetch(new Request(`${origin}/api/auth/google`) as never, localEnv);
    expect(begin.status).toBe(303);
    expect((await server.as(null)(begin.headers.get('Location')!)).status).toBe(303);

    const token = await server.signUp('proxy-user');
    const productionFetch = globalThis.fetch;
    vi.stubGlobal('fetch', server.as(null));
    try {
      const me = await worker.fetch(new Request(`${origin}/api/me`, { headers: { Cookie: `blitz_session=${token}` } }) as never, localEnv);
      expect((await me.json() as { account: { email: string } }).account.email).toBe('proxy-user@example.com');

      const sync = await worker.fetch(new Request(`${origin}/api/sync`, {
        method: 'POST', headers: { Origin: origin, Cookie: `blitz_session=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor: 0, changes: [] }),
      }) as never, localEnv);
      expect(sync.status).toBe(200);

      const signOut = await worker.fetch(new Request(`${origin}/api/auth/sign-out`, {
        method: 'POST', headers: { Origin: origin, Cookie: `blitz_session=${token}` },
      }) as never, localEnv);
      expect(signOut.status).toBe(200);
      expect(signOut.headers.get('Set-Cookie')).toContain('Max-Age=0');
      expect((await server.as(token)('/api/me').then((r) => r.json()) as { account: unknown }).account).toBeNull();
    } finally {
      vi.stubGlobal('fetch', productionFetch);
    }
  });

  it("checks writing on this Worker with production's account", async () => {
    const localEnv = { ...server.env, OPENAI_API_KEY: 'test-openai-key', DEVELOPMENT_UPSTREAM: 'https://blitz.test' };
    const token = await server.signUp('writer');
    const productionFetch = globalThis.fetch;
    // Production only answers who is signed in; it knows nothing of checks.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === '/api/me') return server.as(null)(input, init);
      if (url.href === 'https://api.openai.com/v1/responses') {
        return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: '{"language":"en","mistakes":[]}' }] }] }));
      }
      return new Response('Not found', { status: 404 });
    });
    const check = (cookie?: string) =>
      worker.fetch(new Request(`${origin}/api/correct`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ language: 'en', text: 'We were late.' }),
      }) as never, localEnv);
    try {
      expect((await check()).status).toBe(401);
      const response = await check(`blitz_session=${token}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ language: 'en', marks: [] });
    } finally {
      vi.stubGlobal('fetch', productionFetch);
    }
  });
});
