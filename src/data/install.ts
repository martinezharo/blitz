import { useSyncExternalStore } from 'react';

/**
 * How this browser can put Blitz on the device:
 * - `native`: it handed us an install prompt to show on demand (Chrome, Edge, Android).
 * - `manual`: iPhones and iPads have no prompt, only Share → Add to Home Screen.
 * - `null`: already installed, or a browser with no way to install.
 */
export type InstallMode = 'native' | 'manual' | null;

/** The one event type browsers only half-document; Safari and Firefox never fire it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let prompt: InstallPromptEvent | null = null;
let mode: InstallMode = null;
const listeners = new Set<() => void>();

function installed(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function iosDevice(): boolean {
  // iPadOS asks for the desktop site and says it is a Mac, but only it has a touch screen.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function set(next: InstallMode) {
  if (next === mode) return;
  mode = next;
  for (const listener of listeners) listener();
}

function settle() {
  if (installed()) set(null);
  else if (prompt) set('native');
  else set(iosDevice() ? 'manual' : null);
}

// The prompt can fire before the app mounts, so listen from import time.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    settle();
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    settle();
  });
  matchMedia('(display-mode: standalone)').addEventListener('change', settle);
  settle();
}

/** Shows the browser's install prompt. A prompt works once; the browser offers a new one later. */
export async function install(): Promise<void> {
  const event = prompt;
  if (!event) return;
  prompt = null;
  settle();
  await event.prompt();
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => mode,
    () => null,
  );
}
