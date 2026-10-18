/**
 * The app's sound effects, synthesised with Web Audio instead of shipped as
 * files: nothing to download, nothing to decode, and every sound can follow
 * what happened (a letter's place in the word sets its note).
 *
 * Short, soft and mostly pitched on one C major pentatonic scale, so sounds
 * that land on top of each other never clash. Silent until switched on, and
 * quietly does nothing where audio is blocked or missing.
 */

let enabled = false;
let context: AudioContext | null = null;
let output: AudioNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** C major pentatonic from C5 up, the notes a word is spelled on. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02];

export function setSoundsOn(on: boolean) {
  enabled = on;
}

/**
 * The audio context, made on first use. Browsers only let it start inside a
 * tap or key press, so `wake` also runs on every one of those (see below).
 */
function audio(): AudioContext | null {
  if (!enabled || typeof AudioContext === 'undefined') return null;
  if (!context) {
    try {
      // On iOS: mix with whatever else is playing, and stay quiet on silent.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      context = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    // A gentle limiter, so a chord on top of a click never gets harsh.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 10;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const master = context.createGain();
    master.gain.value = 0.9;
    master.connect(limiter).connect(context.destination);
    output = master;
  }
  if (context.state !== 'running') context.resume().catch(() => {});
  return context;
}

function wake() {
  audio();
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'keydown', 'touchend']) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
}

/** Runs `build` against a live context, unless sound is off, blocked or the page is hidden. */
function sound(build: (ctx: AudioContext, out: AudioNode, now: number) => void) {
  if (typeof document !== 'undefined' && document.hidden) return;
  const ctx = audio();
  if (!ctx || !output) return;
  try {
    build(ctx, output, ctx.currentTime + 0.005);
  } catch {
    // A missed sound is never worth an error.
  }
}

let voice: AudioBufferSourceNode | null = null;

export function soundsOn(): boolean {
  return enabled;
}

/**
 * Plays a spoken word (see speech/), cutting off the one before. Straight to
 * the speakers rather than through the effects' limiter, which would squash
 * it. Follows the same switch: with sounds off, nothing is said either.
 */
export function playVoice(samples: Float32Array<ArrayBuffer>, sampleRate: number) {
  if (typeof document !== 'undefined' && document.hidden) return;
  const ctx = audio();
  if (!ctx || samples.length === 0) return;
  try {
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    voice?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    voice = source;
  } catch {
    // A missed word is never worth an error.
  }
}

interface Tone {
  freq: number;
  /** Where the pitch glides to, over `glide` seconds. */
  to?: number;
  glide?: number;
  at: number;
  length: number;
  volume: number;
  wave?: OscillatorType;
  attack?: number;
}

function tone(ctx: AudioContext, out: AudioNode, { freq, to, glide, at, length, volume, wave = 'sine', attack = 0.004 }: Tone) {
  const oscillator = ctx.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(freq, at);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, at + (glide ?? length));
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(out);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

interface Noise {
  at: number;
  length: number;
  volume: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
}

function noise(ctx: AudioContext, out: AudioNode, { at, length, volume, filter, freq, to, q = 1 }: Noise) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const shape = ctx.createBiquadFilter();
  shape.type = filter;
  shape.Q.value = q;
  shape.frequency.setValueAtTime(freq, at);
  if (to) shape.frequency.exponentialRampToValueAtTime(to, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.01, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(shape).connect(gain).connect(out);
  source.start(at, Math.random() * 0.5);
  source.stop(at + length + 0.02);
}

/** A soft mallet on wood: the note, a faint overtone, and the knock of the hit. */
function pluck(ctx: AudioContext, out: AudioNode, freq: number, at: number, volume: number, length = 0.22) {
  tone(ctx, out, { freq, at, length, volume, attack: 0.003 });
  tone(ctx, out, { freq: freq * 4, at, length: length * 0.25, volume: volume * 0.18, attack: 0.002 });
  noise(ctx, out, { at, length: 0.018, volume: volume * 0.5, filter: 'bandpass', freq: freq * 2, q: 2 });
}

/** A small bell: rings longer, with a bright, quickly fading shimmer. */
function bell(ctx: AudioContext, out: AudioNode, freq: number, at: number, volume: number, length = 0.6) {
  tone(ctx, out, { freq, at, length, volume, attack: 0.004 });
  tone(ctx, out, { freq: freq * 2, at, length: length * 0.45, volume: volume * 0.28, attack: 0.003 });
  tone(ctx, out, { freq: freq * 3.01, at, length: length * 0.2, volume: volume * 0.08, attack: 0.002 });
}

const note = (step: number) => SCALE[Math.max(0, Math.min(SCALE.length - 1, step))]!;

export const sounds = {
  /** Picking one of several options. Barely there; it happens a lot. */
  tap() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 1900, to: 1500, at: now, length: 0.035, volume: 0.05, wave: 'triangle' });
      noise(ctx, out, { at: now, length: 0.012, volume: 0.07, filter: 'highpass', freq: 3500 });
    });
  },

  /** A letter dropped into the word; each place in the word is one note higher. */
  place(slot: number) {
    sound((ctx, out, now) => pluck(ctx, out, note(slot), now, 0.13));
  },

  /** A letter taken back out of the word. */
  lift() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 440, to: 330, glide: 0.08, at: now, length: 0.13, volume: 0.08 });
      noise(ctx, out, { at: now, length: 0.015, volume: 0.04, filter: 'bandpass', freq: 900, q: 2 });
    });
  },

  /** A right answer: two bright bells going up. */
  correct() {
    sound((ctx, out, now) => {
      bell(ctx, out, note(4), now, 0.13, 0.4);
      bell(ctx, out, note(7), now + 0.085, 0.14, 0.75);
    });
  },

  /** A wrong answer: two low notes going down. Kind, not a buzzer. */
  wrong() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 349.23, at: now, length: 0.18, volume: 0.1, wave: 'triangle', attack: 0.008 });
      tone(ctx, out, { freq: 293.66, to: 277.18, glide: 0.3, at: now + 0.14, length: 0.36, volume: 0.1, wave: 'triangle', attack: 0.008 });
    });
  },

  /** A word climbing a level, played on the tail of `correct`. */
  levelUp() {
    sound((ctx, out, now) => {
      [8, 10, 12].forEach((step, index) => bell(ctx, out, note(step), now + 0.24 + index * 0.06, 0.05, 0.35));
    });
  },

  /** The end of a lesson: a rising arpeggio, with a sparkle on top when every answer was right. */
  complete(perfect: boolean) {
    sound((ctx, out, now) => {
      [0, 2, 3, 5].forEach((step, index) => bell(ctx, out, note(step), now + index * 0.09, 0.11, index === 3 ? 1.1 : 0.45));
      if (perfect) [7, 9, 10, 12].forEach((step, index) => bell(ctx, out, note(step), now + 0.4 + index * 0.055, 0.045, 0.5));
    });
  },

  /**
   * The streak growing by a day, timed to its celebration: a flame catching
   * with a warm swell, then the count turning over on a knock, a bell and a
   * sparkle. Only ever played once the lesson's own sounds are over.
   */
  streak() {
    sound((ctx, out, now) => {
      noise(ctx, out, { at: now, length: 0.5, volume: 0.07, filter: 'bandpass', freq: 250, to: 2600, q: 0.9 });
      tone(ctx, out, { freq: 196, to: 392, glide: 0.35, at: now, length: 0.45, volume: 0.06, attack: 0.03 });
      pluck(ctx, out, note(3), now + 0.55, 0.09, 0.18);
      bell(ctx, out, note(5), now + 0.6, 0.12, 0.8);
      bell(ctx, out, note(7), now + 0.6, 0.06, 0.6);
      [7, 9, 12].forEach((step, index) => bell(ctx, out, note(step), now + 0.74 + index * 0.06, 0.035, 0.4));
    });
  },

  /** The new count landing in its corner: one soft knock. */
  streakLand() {
    sound((ctx, out, now) => {
      pluck(ctx, out, note(5), now, 0.08, 0.2);
      noise(ctx, out, { at: now, length: 0.04, volume: 0.04, filter: 'lowpass', freq: 1200 });
    });
  },

  /** Into a lesson: a quick rush up and two notes. */
  start() {
    sound((ctx, out, now) => {
      noise(ctx, out, { at: now, length: 0.26, volume: 0.06, filter: 'bandpass', freq: 500, to: 3200, q: 1.4 });
      pluck(ctx, out, note(3), now + 0.1, 0.1);
      pluck(ctx, out, note(5), now + 0.18, 0.11, 0.35);
    });
  },

  /** A sheet or card opening. */
  open() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 330, to: 660, glide: 0.09, at: now, length: 0.15, volume: 0.07 });
      noise(ctx, out, { at: now, length: 0.12, volume: 0.025, filter: 'bandpass', freq: 800, to: 2000, q: 1 });
    });
  },

  /** A sheet or card closing without anything saved. */
  close() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 560, to: 300, glide: 0.09, at: now, length: 0.13, volume: 0.05 });
      noise(ctx, out, { at: now, length: 0.1, volume: 0.02, filter: 'bandpass', freq: 1800, to: 700, q: 1 });
    });
  },

  /** A word saved: a pop and a light ding. */
  saved() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 420, to: 900, glide: 0.05, at: now, length: 0.08, volume: 0.08 });
      bell(ctx, out, note(8), now + 0.055, 0.075, 0.4);
    });
  },

  /** The first press on delete, which asks for a second one. */
  armed() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 233.08, at: now, length: 0.1, volume: 0.09, wave: 'triangle' });
      noise(ctx, out, { at: now, length: 0.015, volume: 0.04, filter: 'bandpass', freq: 700, q: 2 });
    });
  },

  /** A word deleted: it crumples away downwards. */
  deleted() {
    sound((ctx, out, now) => {
      noise(ctx, out, { at: now, length: 0.28, volume: 0.07, filter: 'lowpass', freq: 3500, to: 250, q: 0.8 });
      tone(ctx, out, { freq: 294, to: 131, glide: 0.24, at: now, length: 0.26, volume: 0.07 });
    });
  },

  /** Not possible yet, or it did not work: a soft double bump. */
  nudge() {
    sound((ctx, out, now) => {
      tone(ctx, out, { freq: 196, at: now, length: 0.07, volume: 0.08, wave: 'triangle' });
      tone(ctx, out, { freq: 196, at: now + 0.09, length: 0.08, volume: 0.07, wave: 'triangle' });
    });
  },

  /** A picture added: a little shutter. */
  snap() {
    sound((ctx, out, now) => {
      noise(ctx, out, { at: now, length: 0.025, volume: 0.16, filter: 'bandpass', freq: 2800, q: 1.5 });
      noise(ctx, out, { at: now + 0.06, length: 0.035, volume: 0.12, filter: 'bandpass', freq: 1900, q: 1.5 });
    });
  },

  /** A switch flipped; `up` clicks higher, for on and for light. */
  toggle(up: boolean) {
    sound((ctx, out, now) => {
      noise(ctx, out, { at: now, length: 0.02, volume: 0.12, filter: 'bandpass', freq: up ? 2600 : 1600, q: 2 });
      tone(ctx, out, { freq: up ? 1200 : 800, at: now, length: 0.045, volume: 0.07, wave: 'triangle' });
    });
  },
};
