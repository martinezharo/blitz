import {
  type Change,
  MAX_PHOTO_BYTES,
  MAX_PULL,
  MAX_PUSH,
  PHOTO_KEY,
  parseChange,
  type SyncResponse,
  type WireWord,
} from '../src/domain/sync.ts';
import type { User } from './auth.ts';
import type { Env } from './env.ts';
import { json, problem, sha256 } from './http.ts';

/**
 * Applies the device's changes, then returns everything past its cursor.
 *
 * Every accepted write takes the next number from the user's `seq`, so a
 * cursor is a plain "seen up to here". The device's own writes come back too;
 * it recognises them by their unchanged `updatedAt`.
 */
export async function sync(request: Request, env: Env, user: User): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { cursor?: unknown; changes?: unknown } | null;
  const cursor = body?.cursor;
  if (!Number.isSafeInteger(cursor) || (cursor as number) < 0 || !Array.isArray(body?.changes)) {
    return problem(400, 'Expected { cursor, changes }');
  }
  if (body.changes.length > MAX_PUSH) return problem(413, `At most ${MAX_PUSH} changes per request`);
  const changes = body.changes.map(parseChange);
  if (changes.some((change) => change === null)) return problem(400, 'Malformed change');

  if (changes.length > 0) {
    const statements = (changes as Change[]).flatMap((change) => [
      env.DB.prepare('UPDATE users SET seq = seq + 1 WHERE id = ?').bind(user.id),
      // Last write wins: an older change than the stored one is dropped.
      env.DB.prepare(
        `INSERT INTO words (user_id, id, data, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, (SELECT seq FROM users WHERE id = ?1))
         ON CONFLICT (user_id, id) DO UPDATE SET
           data = excluded.data, updated_at = excluded.updated_at, version = excluded.version
         WHERE excluded.updated_at > words.updated_at`,
      ).bind(user.id, change.id, change.word && JSON.stringify(change.word), change.updatedAt),
    ]);
    await env.DB.batch(statements);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, data, updated_at, version FROM words WHERE user_id = ? AND version > ? ORDER BY version LIMIT ?',
  )
    .bind(user.id, cursor, MAX_PULL + 1)
    .all<{ id: string; data: string | null; updated_at: number; version: number }>();

  const page = results.slice(0, MAX_PULL);
  const response: SyncResponse = {
    cursor: page.at(-1)?.version ?? (cursor as number),
    changes: page.map((row) => ({
      id: row.id,
      updatedAt: row.updated_at,
      word: row.data === null ? null : (JSON.parse(row.data) as WireWord),
    })),
    more: results.length > MAX_PULL,
  };
  return json(response);
}

/**
 * Photos are stored once per user under the hash of their bytes, so the same
 * picture is never uploaded twice and a key can be cached forever.
 */
const photoPath = (user: User, key: string) => `${user.id}/${key}`;

export async function putPhoto(request: Request, env: Env, user: User, key: string): Promise<Response> {
  if (!PHOTO_KEY.test(key)) return problem(404, 'Unknown photo');
  const length = Number(request.headers.get('Content-Length'));
  if (length > MAX_PHOTO_BYTES) return problem(413, 'Photo too large');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_PHOTO_BYTES) return problem(413, 'Photo too large');
  if ((await sha256(bytes)) !== key) return problem(400, 'Photo does not match its key');
  await env.PHOTOS.put(photoPath(user, key), bytes, {
    httpMetadata: { contentType: request.headers.get('Content-Type') ?? 'image/jpeg' },
  });
  return new Response(null, { status: 204 });
}

export async function getPhoto(env: Env, user: User, key: string): Promise<Response> {
  if (!PHOTO_KEY.test(key)) return problem(404, 'Unknown photo');
  const object = await env.PHOTOS.get(photoPath(user, key));
  if (!object) return problem(404, 'Unknown photo');
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
