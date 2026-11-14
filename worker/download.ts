import { apkName, isAndroidRelease, isVersion } from '../src/domain/release.ts';
import type { Env } from './env.ts';

/** Release files are immutable; latest.json is switched only after the APK upload. */
export async function download(request: Request, env: Env): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  if (!['/download/latest.json', '/download/android.apk'].includes(url.pathname)) return new Response('Not found', { status: 404 });
  const version = url.searchParams.get('version');
  if (version !== null && !isVersion(version)) return new Response('Invalid version', { status: 400 });
  const stored = await env.RELEASES.get(version ? `v${version}/manifest.json` : 'latest.json');
  if (!stored) return new Response('Android download is not available yet. Please use the web version at /learn.', { status: 503, headers: { 'Retry-After': '60' } });
  const release: unknown = await stored.json().catch(() => null);
  if (!isAndroidRelease(release)) return new Response('Invalid release metadata', { status: 503 });
  if (version !== null && version !== release.version) return new Response('Invalid release version', { status: 503 });
  if (url.pathname === '/download/latest.json') {
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(release), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
  }
  // Resolve the mutable alias to an immutable URL before sending bytes. A
  // download resumed after another release must keep fetching the same APK.
  if (version === null) {
    url.searchParams.set('version', release.version);
    return new Response(null, { status: 307, headers: { Location: url.pathname + url.search, 'Cache-Control': 'no-store' } });
  }
  const key = `v${release.version}/${apkName(release.version)}`;
  let range = request.method === 'GET' && request.headers.has('Range');
  const ifRange = request.headers.get('If-Range');
  if (range && ifRange !== null) {
    const current = await env.RELEASES.head(key);
    if (!current) return new Response('APK not found', { status: 404 });
    range = ifRange === current.httpEtag;
  }
  const object = await env.RELEASES.get(key, range ? { range: request.headers } : undefined);
  if (!object) return new Response('APK not found', { status: 404 });
  const headers = new Headers({
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${apkName(release.version)}"`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    'ETag': object.httpEtag,
    'X-Checksum-SHA256': release.sha256,
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(object.size),
  });
  let status = 200;
  if (range && object.range && 'offset' in object.range && object.range.offset !== undefined && object.range.length !== undefined) {
    const { offset, length } = object.range;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    status = 206;
  }
  if (request.method === 'HEAD') await object.body.cancel();
  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
}
