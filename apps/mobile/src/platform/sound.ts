import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

/**
 * The app's sound effects, made on the device instead of shipped as files, as
 * on the web: short, soft and mostly on one C major pentatonic scale, so
 * sounds that land on top of each other never clash.
 *
 * The browser builds them with Web Audio. A device has no such thing, so the
 * same few tones are written into a small WAV the first time each is heard and
 * played from there. `place(slot)` still changes with the letter's place in
 * the word, which is why they are made rather than bundled.
 */

const RATE = 44_100;
/** C major pentatonic from C5 up, the notes a word is spelled on. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02];
const note = (step: number) => SCALE[Math.max(0, Math.min(SCALE.length - 1, step))]!;

let enabled = true;
export function setSoundsOn(on: boolean) {
  enabled = on;
}
export const soundsOn = () => enabled;

function silence(length: number): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(length * RATE)));
}

function mix(into: Float32Array, add: Float32Array) {
  for (let i = 0; i < add.length && i < into.length; i++) into[i]! += add[i]!;
}

/** A note: an oscillator with a fast attack and an exponential fade. */
function tone(freq: number, { at = 0, length = 0.2, volume = 0.1, wave = 'sine', attack = 0.004, to, glide }: { at?: number; length?: number; volume?: number; wave?: 'sine' | 'triangle'; attack?: number; to?: number; glide?: number } = {}): Float32Array {
  const buffer = silence(length);
  const start = Math.floor(at * RATE);
  const end = Math.min(buffer.length, start + Math.ceil(length * RATE));
  for (let i = start; i < end; i++) {
    const t = (i - start) / RATE;
    const progress = t / length;
    const pitch = to ? freq * Math.pow(to / freq, Math.min(1, t / (glide ?? length))) : freq;
    const phase = (2 * Math.PI * pitch * t) % (2 * Math.PI);
    const waveValue = wave === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
    const envelope = Math.min(1, t / attack) * Math.exp(-t / (length / 4));
    buffer[i]! += waveValue * envelope * volume * (progress < 1 ? 1 : 0);
  }
  return buffer;
}

/** A short burst of filtered-ish noise: the knock of a mallet, a breath. */
function noise({ at = 0, length = 0.02, volume = 0.05, bright = 0.5 }: { at?: number; length?: number; volume?: number; bright?: number } = {}): Float32Array {
  const buffer = silence(length);
  const start = Math.floor(at * RATE);
  const end = Math.min(buffer.length, start + Math.ceil(length * RATE));
  // A one-pole filter, high or low, standing in for a biquad.
  let last = 0;
  for (let i = start; i < end; i++) {
    const t = (i - start) / RATE;
    const white = Math.random() * 2 - 1;
    last = last + (white - last) * (bright <= 0.5 ? 0.25 : 0.75);
    buffer[i]! += last * Math.exp(-t / (length / 3)) * volume;
  }
  return buffer;
}

/** A soft mallet on wood: the note, a faint overtone, and the knock of the hit. */
function pluck(freq: number, at: number, volume: number, length = 0.22): Float32Array {
  const out = silence(at + length);
  mix(out, tone(freq, { at, length, volume, attack: 0.003 }));
  mix(out, tone(freq * 4, { at, length: length * 0.25, volume: volume * 0.18, attack: 0.002 }));
  mix(out, noise({ at, length: 0.018, volume: volume * 0.5, bright: 0.8 }));
  return out;
}

/** A small bell: rings longer, with a bright, quickly fading shimmer. */
function bell(freq: number, at: number, volume: number, length = 0.6): Float32Array {
  const out = silence(at + length);
  mix(out, tone(freq, { at, length, volume, attack: 0.004 }));
  mix(out, tone(freq * 2, { at, length: length * 0.45, volume: volume * 0.28, attack: 0.003 }));
  mix(out, tone(freq * 3.01, { at, length: length * 0.2, volume: volume * 0.08, attack: 0.002 }));
  return out;
}

/** Several sounds laid end to end (or on top of each other), as one buffer. */
function together(...parts: Float32Array[]): Float32Array {
  const length = Math.max(...parts.map((part) => part.length));
  const out = new Float32Array(length);
  for (const part of parts) mix(out, part);
  return out;
}

const BUILDERS: Record<string, () => Float32Array> = {
  tap: () => together(tone(1900, { to: 1500, length: 0.035, volume: 0.05, wave: 'triangle' }), noise({ length: 0.012, volume: 0.07, bright: 0.9 })),
  lift: () => together(tone(440, { to: 330, glide: 0.08, length: 0.13, volume: 0.08 }), noise({ length: 0.015, volume: 0.04 })),
  correct: () => together(bell(note(4), 0, 0.13, 0.4), bell(note(7), 0.085, 0.14, 0.75)),
  wrong: () => together(
    tone(349.23, { length: 0.18, volume: 0.1, wave: 'triangle', attack: 0.008 }),
    tone(293.66, { to: 277.18, glide: 0.3, at: 0.14, length: 0.36, volume: 0.1, wave: 'triangle', attack: 0.008 }),
  ),
  levelUp: () => together(...[8, 10, 12].map((step, index) => bell(note(step), 0.24 + index * 0.06, 0.05, 0.35))),
  start: () => together(
    noise({ length: 0.26, volume: 0.06, bright: 0.9 }),
    pluck(note(3), 0.1, 0.1),
    pluck(note(5), 0.18, 0.11, 0.35),
  ),
  open: () => together(tone(330, { to: 660, glide: 0.09, length: 0.15, volume: 0.07 }), noise({ length: 0.12, volume: 0.025, bright: 0.7 })),
  close: () => together(tone(560, { to: 300, glide: 0.09, length: 0.13, volume: 0.05 }), noise({ length: 0.1, volume: 0.02, bright: 0.6 })),
  saved: () => together(tone(420, { to: 900, glide: 0.05, length: 0.08, volume: 0.08 }), bell(note(8), 0.055, 0.075, 0.4)),
  armed: () => together(tone(233.08, { length: 0.1, volume: 0.09, wave: 'triangle' }), noise({ length: 0.015, volume: 0.04 })),
  deleted: () => together(noise({ length: 0.28, volume: 0.07, bright: 0.3 }), tone(294, { to: 131, glide: 0.24, length: 0.26, volume: 0.07 })),
  nudge: () => together(
    tone(196, { length: 0.07, volume: 0.08, wave: 'triangle' }),
    tone(196, { at: 0.09, length: 0.08, volume: 0.07, wave: 'triangle' }),
  ),
  snap: () => together(noise({ length: 0.025, volume: 0.16, bright: 0.85 }), noise({ at: 0.06, length: 0.035, volume: 0.12, bright: 0.7 })),
  streak: () => together(
    noise({ length: 0.5, volume: 0.07, bright: 0.5 }),
    tone(196, { to: 392, glide: 0.35, length: 0.45, volume: 0.06, attack: 0.03 }),
    pluck(note(3), 0.55, 0.09, 0.18),
    bell(note(5), 0.6, 0.12, 0.8),
    bell(note(7), 0.6, 0.06, 0.6),
    ...[7, 9, 12].map((step, index) => bell(note(step), 0.74 + index * 0.06, 0.035, 0.4)),
  ),
  streakLand: () => together(pluck(note(5), 0, 0.08, 0.2), noise({ length: 0.04, volume: 0.04, bright: 0.2 })),
  toggleOn: () => together(noise({ length: 0.02, volume: 0.12, bright: 0.9 }), tone(1200, { length: 0.045, volume: 0.07, wave: 'triangle' })),
  toggleOff: () => together(noise({ length: 0.02, volume: 0.12, bright: 0.6 }), tone(800, { length: 0.045, volume: 0.07, wave: 'triangle' })),
};

/** The notes of a completed lesson, with a sparkle when every answer was right. */
const complete = (perfect: boolean) =>
  together(
    ...[0, 2, 3, 5].map((step, index) => bell(note(step), index * 0.09, 0.11, index === 3 ? 1.1 : 0.45)),
    ...(perfect ? [7, 9, 10, 12].map((step, index) => bell(note(step), 0.4 + index * 0.055, 0.045, 0.5)) : []),
  );

/** A letter dropped into the word; each place in the word is one note higher. */
const place = (slot: number) => pluck(note(slot), 0, 0.13);

/** 16-bit mono PCM, which every platform plays. */
function wav(samples: Float32Array): Uint8Array {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample * scale)) * 32767, true));
  return bytes;
}

const files = new Map<string, string>();

/** The WAV for a sound, written once beside the others. */
function fileFor(name: string, build: () => Float32Array): string | null {
  const known = files.get(name);
  if (known) return known;
  try {
    const file = new File(Paths.cache, 'sounds', `${name}.wav`);
    if (!file.parentDirectory.exists) file.parentDirectory.create({ intermediates: true, idempotent: true });
    if (!file.exists) file.writeSync(wav(build()));
    files.set(name, file.uri);
    return file.uri;
  } catch {
    return null;
  }
}

/** Plays the file, cleaning the player up after it. Never throws: a missed sound is nothing. */
function play(uri: string | null, seconds = 2) {
  if (!uri || !enabled) return;
  try {
    const player = createAudioPlayer({ uri });
    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // Already gone.
      }
    }, Math.min(4000, Math.max(400, seconds * 1000)));
  } catch {
    // A missed sound is never worth an error.
  }
}

function sound(name: string, build: () => Float32Array, seconds?: number) {
  if (!enabled) return;
  play(fileFor(name, build), seconds);
}

export const sounds = {
  tap: () => sound('tap', BUILDERS.tap!, 0.1),
  place: (slot: number) => sound(`place-${slot}`, () => place(slot), 0.3),
  lift: () => sound('lift', BUILDERS.lift!, 0.3),
  correct: () => sound('correct', BUILDERS.correct!, 1),
  wrong: () => sound('wrong', BUILDERS.wrong!, 0.7),
  levelUp: () => sound('levelUp', BUILDERS.levelUp!, 0.8),
  complete: (perfect: boolean) => sound(`complete-${perfect}`, () => complete(perfect), 1.5),
  streak: () => sound('streak', BUILDERS.streak!, 1.4),
  streakLand: () => sound('streakLand', BUILDERS.streakLand!, 0.4),
  start: () => sound('start', BUILDERS.start!, 0.6),
  open: () => sound('open', BUILDERS.open!, 0.4),
  close: () => sound('close', BUILDERS.close!, 0.4),
  saved: () => sound('saved', BUILDERS.saved!, 0.5),
  armed: () => sound('armed', BUILDERS.armed!, 0.3),
  deleted: () => sound('deleted', BUILDERS.deleted!, 0.5),
  nudge: () => sound('nudge', BUILDERS.nudge!, 0.3),
  snap: () => sound('snap', BUILDERS.snap!, 0.2),
  toggle: (up: boolean) => sound(up ? 'toggleOn' : 'toggleOff', up ? BUILDERS.toggleOn! : BUILDERS.toggleOff!, 0.1),
};
