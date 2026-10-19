import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/**
 * The device's copy of everything: words, the grammar history, the days
 * practised, what sync has yet to send, and the odds and ends of preferences.
 *
 * `src/data/*` is the only thing that knows this is SQLite, the same way the
 * web app's `db.ts` is the only thing that knows about IndexedDB.
 */

export const db: SQLiteDatabase = openDatabaseSync('blitz.db');

/**
 * The shape of the tables, applied once per version. Nothing here is ever
 * rewritten in place: a new version adds a migration below.
 */
const MIGRATIONS: string[] = [
  // 1
  `
  CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    type TEXT NOT NULL,
    term TEXT NOT NULL,
    article TEXT,
    plural TEXT,
    counterpart TEXT,
    translation TEXT,
    definition TEXT,
    photo TEXT,
    photoKey TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS words_by_language ON words (language, createdAt DESC);

  CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    written TEXT NOT NULL,
    corrected TEXT NOT NULL,
    fixes TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS corrections_by_language ON corrections (language, createdAt DESC);

  CREATE TABLE IF NOT EXISTS days (
    day TEXT PRIMARY KEY,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    kind TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function migrate(): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= MIGRATIONS.length) return;
  db.withTransactionSync(() => {
    for (let index = version; index < MIGRATIONS.length; index++) db.execSync(MIGRATIONS[index]!);
    db.execSync(`PRAGMA user_version = ${MIGRATIONS.length}`);
  });
}

migrate();

/* --- a tiny store, so a screen redraws when something is written --- */

let revision = 0;
const listeners = new Set<() => void>();

/** Called after any write, so whatever is on screen reads it again. */
export function changed(): void {
  revision++;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const currentRevision = () => revision;

/* --- preferences and sync bookkeeping --- */

export function getMeta(key: string): string | null {
  return db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;
}

export function setMeta(key: string, value: string | null): void {
  if (value === null) db.runSync('DELETE FROM meta WHERE key = ?', key);
  else db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

export function getJson<T>(key: string): T | null {
  const raw = getMeta(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJson(key: string, value: unknown): void {
  setMeta(key, value === null ? null : JSON.stringify(value));
}
