import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FromSpeech, ToSpeech } from './speech.ts';

const { playVoice, stopVoice, soundsOn } = vi.hoisted(() => ({
  playVoice: vi.fn(), stopVoice: vi.fn(), soundsOn: vi.fn(() => true),
}));
vi.mock('../sound.ts', () => ({ playVoice, stopVoice, soundsOn }));

class SpeechWorker {
  onmessage: ((event: { data: FromSpeech }) => void) | null = null;
  postMessage = vi.fn<(message: ToSpeech) => void>();
}

let speech: typeof import('./speech.ts');
let worker: SpeechWorker;

function request(text: string) {
  const message = worker.postMessage.mock.calls.map(([message]) => message)
    .find((message) => message.type === 'say' && message.text === text);
  if (message?.type !== 'say') throw new Error(`No synthesis requested for ${text}`);
  return message.id;
}

function deliver(id: number, samples = Float32Array.of(0.25)) {
  worker.onmessage!({ data: { type: 'audio', id, samples, sampleRate: 22_050 } });
  return samples;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  soundsOn.mockReturnValue(true);
  worker = new SpeechWorker();
  vi.stubGlobal('Worker', vi.fn(function () { return worker; }));
  vi.stubGlobal('navigator', { storage: {} });
  speech = await import('./speech.ts');
  speech.downloadVoice('de', true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('speech across review questions', () => {
  it('does not play a sentence that finishes synthesising after Continue or close', async () => {
    const pending = speech.speak('de', 'Ich habe einen Hund.');
    speech.stopSpeech();
    deliver(request('Ich habe einen Hund.'));
    await pending;
    expect(playVoice).not.toHaveBeenCalled();
    expect(stopVoice).toHaveBeenCalledOnce();
  });

  it('plays the next sentence even if the previous synthesis arrives afterwards', async () => {
    const previous = speech.speak('de', 'Ich habe einen Hund.');
    speech.stopSpeech();
    const current = speech.speak('de', 'Er hilft mir.');
    const samples = deliver(request('Er hilft mir.'));
    await current;
    deliver(request('Ich habe einen Hund.'));
    await previous;
    expect(playVoice).toHaveBeenCalledExactlyOnceWith(samples, 22_050);
  });

  it('prepares a sentence silently and reuses it when the answer is checked', async () => {
    speech.preloadSpeech('de', ['  Ich habe einen Hund.  ']);
    const samples = deliver(request('Ich habe einen Hund.'));
    await Promise.resolve();
    expect(playVoice).not.toHaveBeenCalled();
    await speech.speak('de', 'Ich habe einen Hund.');
    expect(playVoice).toHaveBeenCalledExactlyOnceWith(samples, 22_050);
    expect(worker.postMessage.mock.calls.filter(([message]) => message.type === 'say')).toHaveLength(1);
  });

  it('keeps a cancelled clip available for a later review of the same sentence', async () => {
    const pending = speech.speak('de', 'Er hilft mir.');
    speech.stopSpeech();
    const samples = deliver(request('Er hilft mir.'));
    await pending;
    await speech.speak('de', 'Er hilft mir.');
    expect(playVoice).toHaveBeenCalledExactlyOnceWith(samples, 22_050);
  });

  it('stops a sentence that has already started playing', async () => {
    const pending = speech.speak('de', 'Er hilft mir.');
    deliver(request('Er hilft mir.'));
    await pending;
    expect(playVoice).toHaveBeenCalledOnce();
    speech.stopSpeech();
    expect(stopVoice).toHaveBeenCalledOnce();
  });

  it('still drops synthesis that misses the playback deadline', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const pending = speech.speak('de', 'Er hilft mir.');
    now.mockReturnValue(3000);
    deliver(request('Er hilft mir.'));
    await pending;
    expect(playVoice).not.toHaveBeenCalled();
  });
});
