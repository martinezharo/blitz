import { useSyncExternalStore } from 'react';
import type { Language } from '../../domain/word.ts';
import { playVoice, soundsOn } from '../sound.ts';
import { VOICE_CACHE, VOICES } from './voices.ts';

/**
 * Words read aloud by the same voice on every device, made right here in the
 * browser (speech.worker.ts), so nothing is installed and nothing is sent
 * anywhere. Each language's voice is downloaded once, about 63 MB, and then
 * works offline.
 *
 * A lesson calls `prepareVoice` as it starts; the voice downloads in the
 * background, or wakes up from the cache, while the first question is read.
 * Every word a question can say is made ahead with `preloadSpeech`, so `speak`
 * plays it the moment it is picked. Off when sounds are off.
 */

export type ToSpeech =
  | { type: 'prepare'; language: Language }
  | { type: 'say'; id: number; language: Language; text: string }
  | { type: 'hurry'; id: number };

export type FromSpeech =
  | { type: 'progress'; language: Language; loaded: number; total: number }
  | { type: 'ready'; language: Language }
  | { type: 'failed'; language: Language }
  | { type: 'audio'; id: number; samples: Float32Array<ArrayBuffer> | null; sampleRate: number };

export type VoiceState =
  | { status: 'idle' }
  /** Not downloaded, and the connection asks to save data: it waits for a tap. */
  | { status: 'offered'; bytes: number }
  | { status: 'downloading'; progress: number }
  /** Downloaded, being woken up. */
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'failed' };

const states = new Map<Language, VoiceState>();
const listeners = new Set<() => void>();
const IDLE: VoiceState = { status: 'idle' };

function setState(language: Language, state: VoiceState) {
  states.set(language, state);
  for (const listener of listeners) listener();
}

const stateOf = (language: Language) => states.get(language) ?? IDLE;

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (clip: Clip | null) => void>();

interface Clip {
  samples: Float32Array<ArrayBuffer>;
  sampleRate: number;
}

function speech(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module', name: 'speech' });
    worker.onmessage = (event: MessageEvent<FromSpeech>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setState(message.language, { status: 'downloading', progress: message.loaded / message.total });
      } else if (message.type === 'ready' || message.type === 'failed') {
        setState(message.language, { status: message.type });
      } else {
        waiting.get(message.id)?.(message.samples && { samples: message.samples, sampleRate: message.sampleRate });
        waiting.delete(message.id);
      }
    };
  }
  return worker;
}

function connectionSavesData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

/**
 * Gets the language's voice ready, downloading it the first time. On a
 * connection that asks to save data, the download is offered instead, and
 * `downloadVoice` starts it.
 */
export async function prepareVoice(language: Language) {
  if (!soundsOn() || typeof Worker === 'undefined' || typeof caches === 'undefined') return;
  const status = stateOf(language).status;
  if (status !== 'idle' && status !== 'failed') return;
  const cached = await caches
    .open(VOICE_CACHE)
    .then(async (cache) => (await cache.match(VOICES[language].url)) ?? cache.match(VOICES[language].sourceUrl))
    .then(Boolean, () => false);
  if (stateOf(language).status !== status) return;
  if (!cached && connectionSavesData()) return setState(language, { status: 'offered', bytes: VOICES[language].bytes });
  downloadVoice(language, cached);
}

export function downloadVoice(language: Language, cached = false) {
  setState(language, cached ? { status: 'loading' } : { status: 'downloading', progress: 0 });
  // Asked to be kept, so the browser does not clear 63 MB to make room.
  void navigator.storage?.persist?.().catch(() => {});
  speech().postMessage({ type: 'prepare', language } satisfies ToSpeech);
}

/** The voice's state, for showing a download. */
export function useVoice(language: Language): VoiceState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => stateOf(language),
  );
}

/** Clips by language and text, newest last; a few lessons' worth are kept. */
const clips = new Map<string, { id: number; clip: Promise<Clip | null> }>();
const MAX_CLIPS = 200;

const usable = (language: Language) => {
  const status = stateOf(language).status;
  return soundsOn() && (status === 'downloading' || status === 'loading' || status === 'ready');
};

/** Whether the voice is awake and sounds are on: a word can be heard right now. */
export function canHear(language: Language) {
  return soundsOn() && stateOf(language).status === 'ready';
}

function clip(language: Language, text: string) {
  const key = `${language}\n${text}`;
  let entry = clips.get(key);
  if (!entry) {
    const id = ++nextId;
    const pending = new Promise<Clip | null>((resolve) => waiting.set(id, resolve));
    speech().postMessage({ type: 'say', id, language, text } satisfies ToSpeech);
    entry = { id, clip: pending };
    // A word that could not be made is tried again next time.
    void pending.then((made) => made || clips.delete(key));
    clips.set(key, entry);
    if (clips.size > MAX_CLIPS) clips.delete(clips.keys().next().value!);
  }
  return entry;
}

const spoken = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ');

/** Makes the words ahead of time, in order, so they play the moment they are needed. */
export function preloadSpeech(language: Language, texts: string[]) {
  if (!usable(language)) return;
  for (const text of texts.map(spoken)) if (text) clip(language, text);
}

let latest = 0;
/** How long a word may take to be made and still be said, in milliseconds. */
const LATE = 2500;

/** Says the text, cutting off whatever was being said. If it is still being made, it jumps the queue. */
export async function speak(language: Language, text: string) {
  const asked = ++latest;
  const words = spoken(text);
  if (!words || !usable(language)) return;
  const entry = clip(language, words);
  speech().postMessage({ type: 'hurry', id: entry.id } satisfies ToSpeech);
  const start = performance.now();
  const made = await entry.clip;
  // Only the last word asked for is said, and only while it still follows the
  // tap: not when it arrives late, say at the end of the voice's download.
  if (made && asked === latest && performance.now() - start < LATE) playVoice(made.samples, made.sampleRate);
}
