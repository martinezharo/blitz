import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function source() {
  return { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null };
}

let sound: typeof import('./sound.ts');
let sources: ReturnType<typeof source>[];

beforeEach(async () => {
  vi.resetModules();
  sources = [];
  const destination = {};
  const limiter = {
    threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: vi.fn(),
  };
  const context = {
    state: 'suspended', destination,
    resume: vi.fn(async () => {}),
    createDynamicsCompressor: () => limiter,
    createGain: () => ({ gain: {}, connect: () => limiter }),
    createBuffer: () => ({ copyToChannel: vi.fn() }),
    createBufferSource: () => {
      const made = source();
      sources.push(made);
      return made;
    },
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return context; }));
  vi.stubGlobal('navigator', {});
  sound = await import('./sound.ts');
  sound.setSoundsOn(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('voice cancellation', () => {
  it('stops and disconnects a source even while the mobile audio context is suspended', () => {
    sound.playVoice(Float32Array.of(0.25), 22_050);
    sound.stopVoice();
    expect(sources[0]!.start).toHaveBeenCalledOnce();
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(sources[0]!.disconnect).toHaveBeenCalledOnce();
    sound.stopVoice();
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
  });

  it('does not lose the current source when the previous one finishes stopping', () => {
    sound.playVoice(Float32Array.of(0.25), 22_050);
    sound.playVoice(Float32Array.of(0.5), 22_050);
    sources[0]!.onended!();
    sound.stopVoice();
    expect(sources[1]!.stop).toHaveBeenCalledOnce();
    expect(sources[1]!.disconnect).toHaveBeenCalledOnce();
  });
});
