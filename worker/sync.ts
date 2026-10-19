import {
  type Change,
  type ChangeKind,
  MAX_PHOTO_BYTES,
  MAX_PULL,
  MAX_PUSH,
  PHOTO_KEY,
  parseChange,
  type SyncResponse,
  type WireWord,
} from '../src/domain/sync.ts';
import type { Day } from '../src/domain/streak.ts';
import type { Correction } from '../src/domain/writing.ts';
import type { User } from './auth.ts';
import type { Env } from './env.ts';
import { json, problem, sha256 } from './http.ts';

/**
 * Applies the device's changes, then returns everything past its cursor.
 *
 * Every accepted write takes the next number from the user's `seq`, so a
 * cursor is a plain "seen up to here". The device's own writes come back too;
 * it recognises them by their unchanged `updatedAt`.
 *
 * Each row says what it holds (`kind`). A device is only sent the kinds it
 * says it understands, and words, which every device does.
 */
export async function sync(request: Request, env: Env, user: User): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { cursor?: unknown; changes?: unknown; kinds?: unknown } | null;
  const cursor = body?.cursor;
  if (!Number.isSafeInteger(cursor) || (cursor as number) < 0 || !Array.isArray(body?.changes)) {
    return problem(400, 'Expected { cursor, changes }');
  }
  if (body.changes.length > MAX_PUSH) return problem(413, `At most ${MAX_PUSH} changes per request`);
  const changes = body.changes.map(parseChange);
  if (changes.some((change) => change === null)) return problem(400, 'Malformed change');
  const kinds = Array.isArray(body.kinds) ? body.kinds : [];
  const corrections = kinds.includes('correction' satisfies ChangeKind);
  const days = kinds.includes('day' satisfies ChangeKind);

  if (changes.length > 0) {
    const statements = (changes as Change[]).flatMap((change) => [
      env.DB.prepare('UPDATE users SET seq = seq + 1 WHERE id = ?').bind(user.id),
      // Last write wins: an older change than the stored one is dropped.
      env.DB.prepare(
        `INSERT INTO words (user_id, id, data, updated_at, version, kind)
         VALUES (?1, ?2, ?3, ?4, (SELECT seq FROM users WHERE id = ?1), ?5)
         ON CONFLICT (user_id, id) DO UPDATE SET
           data = excluded.data, updated_at = excluded.updated_at, version = excluded.version, kind = excluded.kind
         WHERE excluded.updated_at > words.updated_at`,
      ).bind(user.id, change.id, stored(change), change.updatedAt, change.kind ?? 'word'),
    ]);
    await env.DB.batch(statements);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, data, updated_at, version, kind FROM words
     WHERE user_id = ?1 AND version > ?2 AND (kind = 'word' OR (kind = 'correction' AND ?3) OR (kind = 'day' AND ?4))
     ORDER BY version LIMIT ?5`,
  )
    .bind(user.id, cursor, corrections ? 1 : 0, days ? 1 : 0, MAX_PULL + 1)
    .all<{ id: string; data: string | null; updated_at: number; version: number; kind: string }>();

  const page = results.slice(0, MAX_PULL);
  const response: SyncResponse = {
    cursor: page.at(-1)?.version ?? (cursor as number),
    changes: page.map((row): Change => {
      if (row.kind === 'correction') {
        return { id: row.id, updatedAt: row.updated_at, kind: 'correction', word: null, correction: row.data === null ? null : (JSON.parse(row.data) as Correction) };
      }
      if (row.kind === 'day') return { id: row.id, updatedAt: row.updated_at, kind: 'day', word: null, day: JSON.parse(row.data!) as Day };
      return { id: row.id, updatedAt: row.updated_at, word: row.data === null ? null : (JSON.parse(row.data) as WireWord) };
    }),
    more: results.length > MAX_PULL,
  };
  return json(response);
}

/** What a change keeps in the row: its word, correction or day, or null once deleted. */
function stored(change: Change): string | null {
  const data = change.kind === 'correction' ? change.correction : change.kind === 'day' ? change.day : change.word;
  return data ? JSON.stringify(data) : null;
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
