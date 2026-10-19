import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { type Change, type ChangeKind, MAX_PUSH, type SyncResponse, type WireWord } from '@blitz/core/sync.ts';
import { dayFromId } from '@blitz/core/streak.ts';
import type { Word } from '@blitz/core/word.ts';
import type { Correction } from '@blitz/core/writing.ts';
import { api } from './api.ts';
import { changed, db } from './db.ts';
import { keepRemote, pendingAt, settle } from './words.ts';

/**
 * Keeps this device's words in step with the account's.
 *
 * Every local write leaves a `pending` row. A sync round sends those, then
 * pulls whatever changed elsewhere since this device's cursor. Words resolve
 * one by one, last write wins. Rounds run after a write, when the app comes
 * back to the front and every minute — the same shape as the web app's, with
 * `AppState` where the browser listens for visibility.
 */

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  syncedAt: number | null;
}

const ROUND_LIMIT = 50;
const KINDS: ChangeKind[] = ['correction', 'day'];
const DEBOUNCE_MS = 800;
const INTERVAL_MS = 60_000;

let state: SyncState = { status: 'off', syncedAt: null };
const listeners = new Set<() => void>();
let enabled = false;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let onUnauthorized: (() => void) | null = null;
let detach: (() => void) | null = null;

function setState(next: Partial<SyncState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const syncState = () => state;

class Unauthorized extends Error {}

export async function startSync(accountId: string, unauthorized: () => void): Promise<void> {
  if (enabled) return;
  enabled = true;
  onUnauthorized = unauthorized;

  const owner = db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'owner')?.value ?? null;
  if (owner && owner !== accountId) clearLocalData();
  db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', 'owner', accountId);

  const wake = () => {
    if (AppState.currentState === 'active') requestSync(0);
  };
  const interval = setInterval(wake, INTERVAL_MS);
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') wake();
  });
  detach = () => {
    clearInterval(interval);
    subscription.remove();
  };
  requestSync(0);
}

export function stopSync(): void {
  enabled = false;
  onUnauthorized = null;
  clearTimeout(timer);
  detach?.();
  detach = null;
  setState({ status: 'off', syncedAt: null });
}

export function requestSync(delay = DEBOUNCE_MS): void {
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  if (!enabled) return;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await round();
    } while (again && enabled);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function round(): Promise<void> {
  setState({ status: 'syncing' });
  try {
    for (let i = 0; i < ROUND_LIMIT; i++) {
      const sent = await pendingChanges();
      const cursor = Number(db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'cursor')?.value ?? 0);
      const response = await request('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor, changes: sent, kinds: KINDS }),
      });
      const result = (await response.json()) as SyncResponse;
      await applyRemote(sent, result);
      const left = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM pending')?.n ?? 0;
      if (!result.more && left === 0) break;
    }
    setState({ status: 'synced', syncedAt: Date.now() });
  } catch (error) {
    if (error instanceof Unauthorized) {
      stopSync();
      onUnauthorized?.();
      return;
    }
    console.warn('Sync failed', error);
    setState({ status: 'error' });
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await api(path, init);
  if (response.status === 401) throw new Unauthorized();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed with ${response.status}`);
  return response;
}

/** The next batch of local writes, with any new photos uploaded first. */
async function pendingChanges(): Promise<Change[]> {
  const pending = db.getAllSync<{ id: string; at: number; kind: ChangeKind | null }>(
    'SELECT id, at, kind FROM pending ORDER BY at LIMIT ?',
    MAX_PUSH,
  );
  const changes: Change[] = [];
  for (const { id, at, kind } of pending) {
    if (kind === 'correction') {
      const correction = correctionOf(id);
      changes.push({ id, updatedAt: correction?.updatedAt ?? at, kind: 'correction', word: null, correction: correction ?? null });
      continue;
    }
    if (kind === 'day') {
      // Days are never taken back, so the id alone says which one.
      const day = dayFromId(id);
      if (day) changes.push({ id, updatedAt: at, kind: 'day', word: null, day });
      else db.runSync('DELETE FROM pending WHERE id = ?', id);
      continue;
    }
    const word = wordOf(id);
    if (!word) {
      changes.push({ id, updatedAt: at, word: null });
      continue;
    }
    const photo = await uploadPhoto(word);
    changes.push({ id, updatedAt: word.updatedAt, word: toWire(word, photo) });
  }
  return changes;
}

/** The picture's bytes, hashed, so the server can keep it under its own name. */
async function uploadPhoto(word: Word): Promise<string | null> {
  if (typeof word.photo !== 'string' || !word.photo) return null;
  if (word.photoKey) return word.photoKey;
  const file = new File(word.photo);
  if (!file.exists) return null;
  const bytes = file.bytesSync();
  const copy = new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
  const key = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, copy));
  await request(`/api/photos/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: copy.buffer,
  });
  // Remembered without touching `updatedAt`: the word itself did not change.
  db.runSync('UPDATE words SET photoKey = ? WHERE id = ? AND updatedAt = ?', key, word.id, word.updatedAt);
  return key;
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

function toWire(word: Word, photo: string | null): WireWord {
  const { photo: _photo, photoKey: _key, ...fields } = word;
  return { ...fields, photo };
}

interface CorrectionRow {
  id: string;
  language: Correction['language'];
  written: string;
  corrected: string;
  fixes: string;
  createdAt: number;
  updatedAt: number;
}

function correctionOf(id: string): Correction | null {
  const row = db.getFirstSync<CorrectionRow>('SELECT * FROM corrections WHERE id = ?', id);
  if (!row) return null;
  return {
    id: row.id,
    language: row.language,
    written: row.written,
    corrected: row.corrected,
    fixes: JSON.parse(row.fixes) as Correction['fixes'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface WordRow {
  id: string;
  language: Word['language'];
  type: Word['type'];
  term: string;
  article: string | null;
  plural: string | null;
  counterpart: string | null;
  translation: string | null;
  definition: string | null;
  photo: string | null;
  photoKey: string | null;
  level: number;
  streak: number;
  archived: number;
  createdAt: number;
  updatedAt: number;
}

function wordOf(id: string): Word | null {
  const row = db.getFirstSync<WordRow>('SELECT * FROM words WHERE id = ?', id);
  if (!row) return null;
  return { ...row, photo: row.photo, archived: row.archived === 1 };
}

async function applyRemote(sent: Change[], result: SyncResponse): Promise<void> {
  // Pictures first: the transaction below must not wait on the network.
  const photos = new Map<string, string | null>();
  for (const change of result.changes) {
    if (change.kind) continue;
    const key = change.word?.photo;
    if (!key || photos.has(key)) continue;
    const local = db.getFirstSync<{ photoKey: string | null; photo: string | null }>('SELECT photoKey, photo FROM words WHERE id = ?', change.id);
    if (local?.photoKey === key) continue;
    photos.set(key, await downloadPhoto(key));
  }

  db.withTransactionSync(() => {
    // Sent writes are done, unless the word was written again meanwhile.
    for (const change of sent) settle(change.id, change.updatedAt);

    for (const change of result.changes) {
      if (change.kind === 'correction') {
        applyCorrection(change);
        continue;
      }
      if (change.kind === 'day') {
        if (change.day) db.runSync('INSERT OR IGNORE INTO days (day, updatedAt) VALUES (?, ?)', change.day, change.updatedAt);
        continue;
      }
      if (change.kind) continue;
      const local = db.getFirstSync<WordRow>('SELECT * FROM words WHERE id = ?', change.id);
      const localAt = Math.max(pendingAt(change.id), local?.updatedAt ?? 0);
      if (localAt >= change.updatedAt) continue;
      db.runSync('DELETE FROM pending WHERE id = ?', change.id);

      if (!change.word) {
        db.runSync('DELETE FROM words WHERE id = ?', change.id);
        continue;
      }
      const key = change.word.photo;
      const photo = key && local?.photoKey === key ? local.photo : key ? (photos.get(key) ?? null) : null;
      keepRemote({ ...change.word, photo, photoKey: photo ? key : null });
    }

    db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', 'cursor', String(result.cursor));
  });
  changed();
}

function applyCorrection(change: Change): void {
  const local = db.getFirstSync<CorrectionRow>('SELECT * FROM corrections WHERE id = ?', change.id);
  if (Math.max(pendingAt(change.id), local?.updatedAt ?? 0) >= change.updatedAt) return;
  db.runSync('DELETE FROM pending WHERE id = ?', change.id);
  if (!change.correction) {
    db.runSync('DELETE FROM corrections WHERE id = ?', change.id);
    return;
  }
  const correction = change.correction;
  db.runSync(
    `INSERT INTO corrections (id, language, written, corrected, fixes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET written = excluded.written, corrected = excluded.corrected, fixes = excluded.fixes, updatedAt = excluded.updatedAt`,
    correction.id,
    correction.language,
    correction.written,
    correction.corrected,
    JSON.stringify(correction.fixes),
    correction.createdAt,
    correction.updatedAt,
  );
}

/** A picture from the account, kept on disk under its hash and shown by URI. */
async function downloadPhoto(key: string): Promise<string | null> {
  const file = new File(Paths.document, 'photos', `${key}.jpg`);
  if (file.exists) return file.uri;
  try {
    const response = await api(`/api/photos/${key}`);
    if (response.status === 401) throw new Unauthorized();
    // A picture that never made it up is dropped rather than retried forever.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GET photo failed with ${response.status}`);
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    file.writeSync(new Uint8Array(await response.arrayBuffer()));
    return file.uri;
  } catch (error) {
    if (error instanceof Unauthorized) throw error;
    return null;
  }
}

/** Sends what is left before signing out. True when nothing is left behind. */
export async function flush(): Promise<boolean> {
  await syncNow();
  return (db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM pending')?.n ?? 0) === 0;
}

/** Forgets this account's words on this device. They stay in the account. */
export function clearLocalData(): void {
  db.withTransactionSync(() => {
    for (const table of ['words', 'corrections', 'days', 'pending', 'meta']) db.runSync(`DELETE FROM ${table}`);
  });
  changed();
}
