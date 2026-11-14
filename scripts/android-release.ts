import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { apkName, compareVersions, isAndroidRelease, isVersion, type AndroidRelease } from '../src/domain/release.ts';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
if (!isVersion(version)) throw new Error('Invalid Android version in package.json');

const [command, input, output] = process.argv.slice(2);
if (command === 'version') {
  if (input && input !== `v${version}`) throw new Error('Tag must match package.json');
  console.log(version);
} else if (command === 'manifest') {
  if (!input || !output || !process.env.ANDROID_HOME) throw new Error('manifest <apk> <output> requires ANDROID_HOME');
  const tools = join(process.env.ANDROID_HOME, 'build-tools');
  const latest = readdirSync(tools).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1)!;
  const signature = execFileSync(join(tools, latest, 'apksigner'), ['verify', '--print-certs', input], { encoding: 'utf8' });
  const links = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  const expected = links[0].target.sha256_cert_fingerprints[0].replaceAll(':', '').toLowerCase();
  const digests = [...signature.matchAll(/certificate SHA-256 digest: ([a-f0-9]{64})/g)].map((match) => match[1]);
  if (digests.length !== 1 || digests[0] !== expected) throw new Error('APK is not signed with the project certificate');
  const info = execFileSync(join(tools, latest, 'aapt'), ['dump', 'badging', input], { encoding: 'utf8' });
  const [major, minor, patch] = version.split('.').map(Number) as [number, number, number];
  if (!info.includes(`package: name='com.fouroli.blitz' versionCode='${major * 1_000_000 + minor * 1_000 + patch}' versionName='${version}'`)) {
    throw new Error('APK package or version does not match this release');
  }
  const apk = readFileSync(input);
  const manifest: AndroidRelease = { version, published: new Date().toISOString(), size: apk.length, sha256: createHash('sha256').update(apk).digest('hex') };
  writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Verified ${apkName(version)} (${apk.length} bytes): ${manifest.sha256}`);
} else if (command === 'check-latest') {
  if (!input) throw new Error('check-latest <manifest>');
  const current: unknown = JSON.parse(readFileSync(resolve(input), 'utf8'));
  if (!isAndroidRelease(current) || compareVersions(version, current.version) <= 0) throw new Error('Release must be newer than the published version');
} else {
  throw new Error('Expected version, manifest, or check-latest');
}
