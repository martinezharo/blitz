import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer } from './test-server.ts';
import { apkName, type AndroidRelease } from '../src/domain/release.ts';

describe('Android downloads', () => {
  let server: Awaited<ReturnType<typeof testServer>>;
  const release: AndroidRelease = { version: '0.1.0', published: '2026-11-14T00:00:00Z', size: 8, sha256: 'a'.repeat(64) };
  beforeAll(async () => { server = await testServer(); });
  afterAll(async () => { await server.dispose(); });
  const request = (path: string, init?: RequestInit) => server.as(null)(`/download/${path}`, init);

  it('keeps unavailable releases out of caches', async () => {
    const response = await request('android.apk');
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('pins the latest download before sending bytes and publishes its checksum', async () => {
    await server.env.RELEASES.put('latest.json', JSON.stringify(release));
    await server.env.RELEASES.put('v0.1.0/manifest.json', JSON.stringify(release));
    await server.env.RELEASES.put(`v0.1.0/${apkName('0.1.0')}`, 'test apk');
    const latest = await request('android.apk');
    expect(latest.status).toBe(307);
    expect(latest.headers.get('Location')).toBe('/download/android.apk?version=0.1.0');
    expect(latest.headers.get('Cache-Control')).toBe('no-store');
    const apk = await request('android.apk?version=0.1.0');
    expect(apk.status).toBe(200);
    expect(apk.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
    expect(apk.headers.get('Content-Disposition')).toContain('Blitz-0.1.0-android.apk');
    expect(apk.headers.get('X-Checksum-SHA256')).toBe(release.sha256);
    expect(await apk.text()).toBe('test apk');
    const metadata = await request('latest.json');
    expect(await metadata.json()).toEqual(release);
  });

  it('supports HEAD and resumed downloads', async () => {
    const head = await request('android.apk?version=0.1.0', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('8');
    expect(await head.text()).toBe('');
    const range = await request('android.apk?version=0.1.0', { headers: { Range: 'bytes=5-7' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('Content-Range')).toBe('bytes 5-7/8');
    expect(range.headers.get('Content-Length')).toBe('3');
    expect(await range.text()).toBe('apk');
    const changed = await request('android.apk?version=0.1.0', { headers: { Range: 'bytes=5-7', 'If-Range': '"old-etag"' } });
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe('test apk');
  });

  it('does not change an older download when latest moves', async () => {
    await server.env.RELEASES.put('latest.json', JSON.stringify({ ...release, version: '0.2.0' }));
    expect((await request('android.apk')).headers.get('Location')).toContain('version=0.2.0');
    expect(await (await request('android.apk?version=0.1.0')).text()).toBe('test apk');
  });

  it('rejects invalid paths, versions, methods and broken metadata', async () => {
    expect((await request('elsewhere')).status).toBe(404);
    expect((await request('android.apk?version=../../secret')).status).toBe(400);
    expect((await request('android.apk', { method: 'POST' })).status).toBe(405);
    await server.env.RELEASES.put('latest.json', '{}');
    expect((await request('android.apk')).status).toBe(503);
  });
});
