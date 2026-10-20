import * as SecureStore from 'expo-secure-store';

/**
 * Where the account lives, and how every request carries it.
 *
 * The web app keeps an HTTP-only cookie. A device keeps the session token it
 * was handed and sends it as `Authorization: Bearer`, which the Worker accepts
 * anywhere it accepts the cookie.
 */

export const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://blitz.4oli.com';

const KEY = 'blitz.session';

let token: string | null = null;
/** The keychain has been read, once. */
let reading: Promise<string | null> | null = null;
/** The token has been written by this session, which then has the last word. */
let touched = false;

export const authToken = () => token;

/**
 * The token, read from the keychain the first time. A sign-in that finished
 * while that read was in flight wins: it is in hand, the keychain may not be.
 */
export function loadToken(): Promise<string | null> {
  reading ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY).catch(() => null);
    if (!touched) token = stored;
    return token;
  })();
  return reading;
}

export async function saveToken(next: string | null): Promise<void> {
  touched = true;
  token = next;
  if (next) await SecureStore.setItemAsync(KEY, next).catch(() => undefined);
  else await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

/**
 * Resolves once the keychain has been read.
 *
 * Without it, the first request of a launch can go out before the token has
 * been loaded: a remembered account looks signed in before `loadToken` has
 * answered, sync starts, gets a 401 and signs the person out.
 */
let loaded: Promise<void> | null = null;
export function ready(): Promise<void> {
  loaded ??= loadToken().then(() => undefined);
  return loaded;
}

export const apiUrl = (path: string) => `${API}${path}`;

/** A request to this account's server, signed in when there is a token. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  await ready();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...init, headers });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await api(path, init);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`);
  return (await response.json()) as T;
}
