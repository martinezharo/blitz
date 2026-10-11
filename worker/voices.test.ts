import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICES } from '../src/shared/speech/voices.ts';
import type { Env } from './env.ts';
import worker from './index.ts';

const fetchModel = vi.fn<typeof fetch>();
const match = vi.fn<Cache['match']>();
const put = vi.fn<Cache['put']>();
const request = (path = VOICES.de.url, method = 'GET', headers: HeadersInit = {}) =>
  new Request(`https://blitz.test${path}`, { method, headers });
const call = (req = request(), env = {}) => worker.fetch(req as never, env as Env);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchModel.mockReset());
  vi.stubGlobal('caches', { default: { match: match.mockReset(), put: put.mockReset() } });
  match.mockResolvedValue(undefined);
  put.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('same-origin voice models', () => {
  it('streams a pinned model without forwarding cookies, ranges or query parameters', async () => {
    fetchModel.mockResolvedValue(new Response('model', { headers: { 'Content-Length': String(VOICES.de.bytes), 'Set-Cookie': 'upstream=secret' } }));
    const response = await call(request(`${VOICES.de.url}?url=https://evil.test`, 'GET', { Cookie: 'blitz_session=secret', Range: 'bytes=0-10' }));
    expect(fetchModel).toHaveBeenCalledExactlyOnceWith(VOICES.de.sourceUrl, { method: 'GET', redirect: 'follow' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(response.headers.get('ETag')).toBe(`"${VOICES.de.sha256}"`);
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(await response.text()).toBe('model');
    expect((put.mock.calls[0]![0] as Request).url).toBe(`https://blitz.test${VOICES.de.url}`);
  });

  it('serves cached models without downloading and omits the body for HEAD', async () => {
    match.mockImplementation(async () => new Response('cached', { headers: { 'Content-Length': String(VOICES.de.bytes) } }));
    expect(await (await call()).text()).toBe('cached');
    const head = await call(request(VOICES.de.url, 'HEAD'));
    expect(head.body).toBeNull();
    expect(head.headers.get('Content-Length')).toBe(String(VOICES.de.bytes));
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it('also serves English without sign-in when development uses a production account', async () => {
    fetchModel.mockResolvedValue(new Response(null, { headers: { 'Content-Length': String(VOICES.en.bytes) } }));
    expect((await call(request(VOICES.en.url, 'HEAD'), { DEVELOPMENT_UPSTREAM: 'https://production.test' })).status).toBe(200);
    expect(fetchModel).toHaveBeenCalledExactlyOnceWith(VOICES.en.sourceUrl, { method: 'HEAD', redirect: 'follow' });
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects arbitrary models and writes before fetching anything', async () => {
    expect((await call(request('/api/voices/unknown.onnx'))).status).toBe(404);
    expect((await call(request(VOICES.de.url, 'POST'))).status).toBe(405);
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it.each([403, 206, 503])('does not cache upstream status %s', async (status) => {
    fetchModel.mockResolvedValue(new Response('error', { status }));
    const response = await call();
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects incomplete models and handles network failures without caching them', async () => {
    fetchModel.mockResolvedValueOnce(new Response('partial', { headers: { 'Content-Length': '7' } })).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await call()).status).toBe(502);
    expect((await call()).status).toBe(502);
    expect(put).not.toHaveBeenCalled();
  });

  it('still serves a model if edge storage is unavailable', async () => {
    put.mockRejectedValue(new Error('Cache full'));
    fetchModel.mockResolvedValue(new Response('model', { headers: { 'Content-Length': String(VOICES.de.bytes) } }));
    expect(await (await call()).text()).toBe('model');
  });
});
