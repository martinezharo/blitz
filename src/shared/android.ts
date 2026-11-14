export const ANDROID_DOWNLOAD = '/download/android.apk';

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}
