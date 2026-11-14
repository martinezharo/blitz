/** Release metadata shared by the publisher and the download endpoint. */
export interface AndroidRelease {
  version: string;
  published: string;
  size: number;
  sha256: string;
}

export function isVersion(value: string): boolean {
  return /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.test(value);
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = left[i]! - right[i]!;
    if (difference) return difference;
  }
  return 0;
}

export function apkName(version: string): string {
  return `Blitz-${version}-android.apk`;
}

export function isAndroidRelease(value: unknown): value is AndroidRelease {
  if (!value || typeof value !== 'object') return false;
  const release = value as Partial<AndroidRelease>;
  return typeof release.version === 'string' && isVersion(release.version)
    && typeof release.published === 'string' && Number.isFinite(Date.parse(release.published))
    && typeof release.size === 'number' && Number.isSafeInteger(release.size) && release.size > 0
    && typeof release.sha256 === 'string' && /^[a-f0-9]{64}$/.test(release.sha256);
}
