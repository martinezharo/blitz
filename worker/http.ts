export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** Where the app lives; the front page has /. Signing in, or failing to, lands here. */
export const APP_PATH = '/learn';

export const problem = (status: number, message: string) => json({ error: message }, { status });

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

export function cookie(name: string, value: string, maxAge: number, path = '/'): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Cookies ride along on cross-site form posts, so anything that writes must
 * come from this origin. Browsers always send Origin on POST, PUT and DELETE.
 *
 * A native app sends no Origin at all: it has no cookie jar to be tricked into
 * using, and its session travels in an Authorization header, which no other
 * site can set on its behalf. So a missing Origin is fine.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return origin === null || origin === new URL(request.url).origin;
}

/** The session token of a request: an app's bearer header, or the browser's cookie. */
export function sessionToken(request: Request, cookieName: string): string | null {
  const header = request.headers.get('Authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token || null;
  }
  return readCookie(request, cookieName);
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
