import { useSyncExternalStore } from 'react';
import { dayFromId } from '../domain/streak.ts';
import { type Change, type ChangeKind, MAX_PUSH, type SyncResponse, type WireWord } from '../domain/sync.ts';
import type { Word } from '../domain/word.ts';
import { db } from './db.ts';
import { pageHidden } from './live.ts';

/**
 * Keeps this device's words in step with the account's.
 *
 * Every local write leaves a `pending` row. A sync round sends those, then
 * pulls whatever changed elsewhere since this device's cursor. Words resolve
 * one by one, last write wins, so two devices editing different words never
 * clash. Rounds run after a write, on focus, on reconnect and every minute.
 */

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  /** When the last round finished cleanly. */
  syncedAt: number | null;
}

const ROUND_LIMIT = 50;
/** Everything besides words that this device keeps in step. */
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

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

class Unauthorized extends Error {}

/**
 * Starts syncing for a signed-in account. Words left behind by a different
 * account are dropped first; words written while signed out join this one.
 */
export async function startSync(accountId: string, unauthorized: () => void): Promise<void> {
  if (enabled) return;
  // Hashing photos needs `crypto.subtle`, which plain-HTTP origins lack.
  if (!globalThis.isSecureContext) return;
  enabled = true;
  onUnauthorized = unauthorized;

  const owner = await db.meta.get('owner');
  if (owner && owner.value !== accountId) await clearLocalData();
  await db.meta.put({ key: 'owner', value: accountId });

  const wake = () => {
    if (document.visibilityState === 'visible') requestSync(0);
  };
  const interval = setInterval(wake, INTERVAL_MS);
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  detach = () => {
    clearInterval(interval);
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', wake);
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

/** Schedules a round soon. Writes call this; bursts collapse into one round. */
export function requestSync(delay = DEBOUNCE_MS): void {
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** Runs a round now, or waits for the one in flight and runs another after it. */
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
  // A hidden page stays off the database (live.ts); being shown asks for a round.
  if (pageHidden()) return;
  const before = state;
  setState({ status: 'syncing' });
  try {
    for (let i = 0; i < ROUND_LIMIT; i++) {
      const sent = await pendingChanges();
      const cursor = Number((await db.meta.get('cursor'))?.value ?? 0);
      const response = await request('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor, changes: sent, kinds: KINDS }),
      });
      const result = (await response.json()) as SyncResponse;
      // Hidden meanwhile: the same changes come back in the next round, and
      // what was sent is sent again, which last write wins makes harmless.
      if (pageHidden()) return setState(before);
      await applyRemote(sent, result);
      if (!result.more && (await db.pending.count()) === 0) break;
    }
    setState({ status: 'synced', syncedAt: Date.now() });
  } catch (error) {
    if (error instanceof Unauthorized) {
      stopSync();
      onUnauthorized?.();
      return;
    }
    console.warn('Sync failed', error);
    setState({ status: navigator.onLine ? 'error' : 'offline' });
  }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (response.status === 401) throw new Unauthorized();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed with ${response.status}`);
  return response;
}

/** The next batch of local writes, with any new photos uploaded first. */
async function pendingChanges(): Promise<Change[]> {
  const pending = await db.pending.limit(MAX_PUSH).toArray();
  const changes: Change[] = [];
  for (const { id, at, kind } of pending) {
    if (kind === 'correction') {
      const correction = await db.corrections.get(id);
      changes.push({ id, updatedAt: correction?.updatedAt ?? at, kind, word: null, correction: correction ?? null });
      continue;
    }
    if (kind === 'day') {
      // Days are never taken back, so the id alone says which one.
      const day = dayFromId(id);
      if (day) changes.push({ id, updatedAt: at, kind, word: null, day });
      else await db.pending.delete(id);
      continue;
    }
    const word = await db.words.get(id);
    if (!word) {
      changes.push({ id, updatedAt: at, word: null });
      continue;
    }
    const photo = await uploadPhoto(word);
    changes.push({ id, updatedAt: word.updatedAt, word: toWire(word, photo) });
  }
  return changes;
}

async function uploadPhoto(word: Word): Promise<string | null> {
  if (!word.photo) return null;
  if (word.photoKey) return word.photoKey;
  const key = await hash(word.photo);
  await request(`/api/photos/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': word.photo.type || 'image/jpeg' },
    body: word.photo,
  });
  // Remembered without touching `updatedAt`: the word itself did not change.
  // Blobs read back from IndexedDB are fresh objects, so an unchanged
  // `updatedAt` is what proves the picture is the one just hashed.
  await db.transaction('rw', db.words, async () => {
    const current = await db.words.get(word.id);
    if (current?.updatedAt === word.updatedAt) await db.words.update(word.id, { photoKey: key });
  });
  return key;
}

function toWire(word: Word, photo: string | null): WireWord {
  const { photo: _blob, photoKey: _key, ...fields } = word;
  return { ...fields, photo };
}

async function applyRemote(sent: Change[], result: SyncResponse): Promise<void> {
  // Pictures are fetched before the transaction: IndexedDB transactions close
  // as soon as they wait on anything but IndexedDB.
  const photos = new Map<string, Blob | null>();
  for (const change of result.changes) {
    if (change.kind) continue;
    const key = change.word?.photo;
    if (!key || photos.has(key)) continue;
    const local = await db.words.get(change.id);
    if (local?.photoKey === key) continue;
    photos.set(key, await downloadPhoto(key));
  }

  await db.transaction('rw', [db.words, db.corrections, db.days, db.pending, db.meta], async () => {
    // Sent writes are done, unless the word was written again meanwhile.
    for (const change of sent) {
      const pending = await db.pending.get(change.id);
      if (pending?.at === change.updatedAt) await db.pending.delete(change.id);
    }

    for (const change of result.changes) {
      if (change.kind === 'correction') {
        await applyCorrection(change);
        continue;
      }
      if (change.kind === 'day') {
        // A day practised anywhere counts here too; the first stamp is kept.
        if (change.day && !(await db.days.get(change.day))) await db.days.put({ day: change.day, updatedAt: change.updatedAt });
        continue;
      }
      // Not a kind this device knows: left alone.
      if (change.kind) continue;
      const pending = await db.pending.get(change.id);
      const local = await db.words.get(change.id);
      const localAt = Math.max(pending?.at ?? 0, local?.updatedAt ?? 0);
      if (localAt >= change.updatedAt) continue;
      if (pending) await db.pending.delete(change.id);

      if (!change.word) {
        await db.words.delete(change.id);
        continue;
      }
      const key = change.word.photo;
      const photo = key && local?.photoKey === key ? local.photo : key ? (photos.get(key) ?? null) : null;
      await db.words.put({ ...change.word, photo, photoKey: photo ? key : null });
    }

    await db.meta.put({ key: 'cursor', value: result.cursor });
  });
}

/** A correction from elsewhere, inside the sync transaction. Last write wins, as for words. */
async function applyCorrection(change: Change): Promise<void> {
  const pending = await db.pending.get(change.id);
  const local = await db.corrections.get(change.id);
  if (Math.max(pending?.at ?? 0, local?.updatedAt ?? 0) >= change.updatedAt) return;
  if (pending) await db.pending.delete(change.id);
  if (change.correction) await db.corrections.put(change.correction);
  else await db.corrections.delete(change.id);
}

async function downloadPhoto(key: string): Promise<Blob | null> {
  const response = await fetch(`/api/photos/${key}`, { credentials: 'same-origin' });
  if (response.status === 401) throw new Unauthorized();
  // A picture that never made it up is dropped rather than retried forever.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET photo failed with ${response.status}`);
  return response.blob();
}

async function hash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Sends what is left before signing out. True when nothing is left behind. */
export async function flush(): Promise<boolean> {
  await syncNow();
  return (await db.pending.count()) === 0;
}

/** Forgets this account's words on this device. They stay in the account. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [db.words, db.corrections, db.days, db.pending, db.meta], async () => {
    await db.words.clear();
    await db.corrections.clear();
    await db.days.clear();
    await db.pending.clear();
    await db.meta.clear();
  });
}
