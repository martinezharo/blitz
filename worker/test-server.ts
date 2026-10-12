import { readdirSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import type { Env } from './env.ts';
import { sha256 } from './http.ts';
import worker from './index.ts';

/**
 * The real Worker on in-memory D1 and R2 (Miniflare), for tests. `as(token)`
 * returns a fetch that is signed in as that session's user.
 */
export async function testServer(overrides: Partial<Env> = {}) {
  const proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false, remoteBindings: false });
  const env = { ...proxy.env, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', OPENAI_API_KEY: undefined, DEVELOPMENT_BRIDGE_SECRET: 'test-bridge-secret', DEVELOPMENT_UPSTREAM: undefined, ...overrides } as Env;

  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--.*$/gm, '');
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  }

  async function signUp(name: string): Promise<string> {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, `sub-${id}`, `${name}@example.com`, name, Date.now())
      .run();
    const token = `token-${id}`;
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), id, Date.now() + 60_000)
      .run();
    return token;
  }

  function as(token: string | null): typeof fetch {
    return async (input, init) => {
      const request = new Request(new URL(String(input), 'https://blitz.test'), init);
      const headers = new Headers(request.headers);
      if (token) headers.set('Cookie', `blitz_session=${token}`);
      if (request.method !== 'GET' && !headers.has('Origin')) headers.set('Origin', 'https://blitz.test');
      const body = request.body ? await request.arrayBuffer() : undefined;
      return worker.fetch(new Request(request.url, { method: request.method, headers, body }) as never, env);
    };
  }

  return { env, signUp, as, dispose: () => proxy.dispose() };
}
