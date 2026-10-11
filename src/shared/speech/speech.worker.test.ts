import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FromSpeech, ToSpeech } from './speech.ts';
import { VOICES } from './voices.ts';

const { createSession, createPhonemizer, run, release } = vi.hoisted(() => ({
  createSession: vi.fn(), createPhonemizer: vi.fn(), run: vi.fn(), release: vi.fn(),
}));

vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: {} },
  InferenceSession: { create: createSession },
  Tensor: class { constructor(public type: string, public data: unknown, public dims: number[]) {} },
}));
vi.mock('./phonemizer/piper_phonemize.js', () => ({ default: createPhonemizer }));

const postMessage = vi.fn<(message: FromSpeech) => void>();
const fetchFile = vi.fn<typeof fetch>();
const match = vi.fn<Cache['match']>();
const put = vi.fn<Cache['put']>();
let scope: { location: { href: string }; postMessage: typeof postMessage; onmessage?: (event: { data: ToSpeech }) => void };
const send = (data: ToSpeech) => scope.onmessage!({ data });
const messages = () => postMessage.mock.calls.map(([message]) => message);

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  scope = { location: { href: 'https://blitz.test/assets/speech.js' }, postMessage };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('fetch', fetchFile);
  vi.stubGlobal('caches', { open: async () => ({ match, put, keys: async () => [], delete: vi.fn() }), keys: async () => [] });
  match.mockImplementation(async () => new Response(new Uint8Array([1])));
  put.mockResolvedValue(undefined);
  fetchFile.mockImplementation(async () => new Response(new Uint8Array([1])));
  createSession.mockResolvedValue({ run, release });
  run.mockResolvedValue({ output: { data: Float32Array.of(0, 0.5, -0.5, 0) } });
  createPhonemizer.mockImplementation(async ({ print }: { print: (line: string) => void }) => ({
    callMain: () => { print(JSON.stringify({ phoneme_ids: [1, 2, 3] })); return 0; },
  }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await import('./speech.worker.ts');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('speech failure recovery', () => {
  it('downloads once on failure, drains the queue and retries only on preparation', async () => {
    match.mockResolvedValue(undefined);
    fetchFile.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/voices/')) throw new TypeError('Failed to fetch');
      return new Response(new Uint8Array([1]));
    });
    send({ type: 'prepare', language: 'de' });
    for (let id = 1; id <= 20; id++) send({ type: 'say', id, language: 'de', text: 'Mund' });
    await vi.waitFor(() => expect(messages().filter((message) => message.type === 'audio')).toHaveLength(20));
    expect(fetchFile.mock.calls.filter(([url]) => url === VOICES.de.url)).toHaveLength(1);
    expect(messages().filter((message) => message.type === 'failed')).toHaveLength(1);
    expect(createPhonemizer).not.toHaveBeenCalled();
    send({ type: 'prepare', language: 'de' });
    await vi.waitFor(() => expect(fetchFile.mock.calls.filter(([url]) => url === VOICES.de.url)).toHaveLength(2));
  });

  it('uses a fresh phonemizer for each word while sharing its downloaded files', async () => {
    for (let id = 1; id <= 20; id++) send({ type: 'say', id, language: id % 2 ? 'de' : 'en', text: 'word' });
    await vi.waitFor(() => expect(messages().filter((message) => message.type === 'audio')).toHaveLength(20));
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createPhonemizer).toHaveBeenCalledTimes(20);
    expect(fetchFile).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(20);
    expect(messages().some((message) => message.type === 'failed')).toBe(false);
  });

  it('stops after synthesis fails and recovers when prepared again', async () => {
    run.mockRejectedValueOnce(new WebAssembly.RuntimeError('memory access out of bounds'));
    for (let id = 1; id <= 5; id++) send({ type: 'say', id, language: 'de', text: 'Mund' });
    await vi.waitFor(() => expect(messages().filter((message) => message.type === 'audio')).toHaveLength(5));
    expect(run).toHaveBeenCalledTimes(1);
    expect(messages().filter((message) => message.type === 'failed')).toHaveLength(1);
    send({ type: 'prepare', language: 'de' });
    send({ type: 'say', id: 6, language: 'de', text: 'Mund' });
    await vi.waitFor(() => expect(messages()).toContainEqual(expect.objectContaining({ type: 'audio', id: 6, samples: expect.any(Float32Array) })));
    expect(release).toHaveBeenCalledOnce();
  });

  it('preserves a previously downloaded Hugging Face model without fetching it again', async () => {
    match.mockImplementation(async (url) => url === VOICES.de.sourceUrl ? new Response(new Uint8Array([1])) : undefined);
    send({ type: 'prepare', language: 'de' });
    await vi.waitFor(() => expect(messages()).toContainEqual({ type: 'ready', language: 'de' }));
    expect(put).toHaveBeenCalledWith(VOICES.de.url, expect.any(Response));
    expect(fetchFile.mock.calls.some(([url]) => url === VOICES.de.url || url === VOICES.de.sourceUrl)).toBe(false);
  });
});
