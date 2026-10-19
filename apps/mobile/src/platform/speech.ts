import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { Language } from '@blitz/core/word.ts';
import { api, API } from '../data/api.ts';
import { soundsOn } from './sound';

/**
 * Words said aloud.
 *
 * The web app makes its own voice in the browser, which costs 63 MB per
 * language before the first word is heard. A phone asks the server instead
 * (`GET /api/say`), which makes each word once for everybody and keeps it in
 * R2. The clip is cached on the device, so a word heard twice costs nothing.
 *
 * `prepareVoice` is kept so the lesson can say the same thing it says on the
 * web; here it only means "the server has a voice", and it is ready at once.
 */

export type VoiceState = { status: 'idle' | 'loading' | 'ready' | 'failed' };

const states = new Map<Language, VoiceState>();
const listeners = new Set<() => void>();

function setState(language: Language, state: VoiceState) {
  states.set(language, state);
  for (const listener of listeners) listener();
}

export const subscribeVoice = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const voiceState = (language: Language) => states.get(language) ?? { status: 'idle' as const };

/** Wakes the voice for a language. Nothing to download: the server has it. */
export async function prepareVoice(language: Language): Promise<void> {
  if (states.get(language)?.status === 'ready') return;
  setState(language, { status: 'ready' });
}

export function canHear(language: Language): boolean {
  return soundsOn() && voiceState(language).status === 'ready';
}

const cacheDir = new Directory(Paths.cache, 'say');

const keyOf = async (language: Language, text: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${language}\n${text}`);

const inFlight = new Map<string, Promise<string | null>>();

/** The clip, on the device, downloading it the first time. */
function clipFile(language: Language, text: string): Promise<string | null> {
  const promise = (async () => {
    const key = await keyOf(language, text);
    const file = new File(cacheDir, `${language}-${key}.wav`);
    if (file.exists) return file.uri;
    if (!cacheDir.exists) cacheDir.create({ intermediates: true, idempotent: true });
    const downloaded = await File.downloadFileAsync(
      `${API}/api/say?language=${language}&text=${encodeURIComponent(text)}`,
      file,
      { idempotent: true },
    );
    return downloaded.uri;
  })();
  return promise;
}

function clip(language: Language, text: string): Promise<string | null> {
  const known = inFlight.get(`${language}\n${text}`);
  if (known) return known;
  const promise = clipFile(language, text).catch(() => {
    inFlight.delete(`${language}\n${text}`);
    return null;
  });
  inFlight.set(`${language}\n${text}`, promise);
  return promise;
}

/** Asks the server to make a lesson's words while the first question is read. */
export async function preloadSpeech(language: Language, texts: string[]): Promise<void> {
  if (!soundsOn() || texts.length === 0) return;
  try {
    await api('/api/say/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, texts: texts.slice(0, 20) }),
    });
  } catch {
    // A word made late is a word made late; nothing to report.
  }
}

let player: AudioPlayer | null = null;
let latest = 0;

/** Says the text, cutting off whatever was being said. */
export async function speak(language: Language, text: string): Promise<void> {
  const asked = ++latest;
  const words = text.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!words || !soundsOn()) return;
  const uri = await clip(language, words);
  if (!uri || asked !== latest) return;
  try {
    player?.remove();
    player = createAudioPlayer({ uri });
    player.play();
  } catch {
    // A missed word is never worth an error.
  }
}

/** Stops whatever is being said, for leaving a lesson. */
export function hush(): void {
  latest++;
  try {
    player?.remove();
  } catch {
    // Already gone.
  }
  player = null;
}
