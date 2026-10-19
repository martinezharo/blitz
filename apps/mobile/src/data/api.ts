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

export const authToken = () => token;

export async function loadToken(): Promise<string | null> {
  token = await SecureStore.getItemAsync(KEY).catch(() => null);
  return token;
}

export async function saveToken(next: string | null): Promise<void> {
  token = next;
  if (next) await SecureStore.setItemAsync(KEY, next).catch(() => undefined);
  else await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

export const apiUrl = (path: string) => `${API}${path}`;

/** A request to this account's server, signed in when there is a token. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...init, headers });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await api(path, init);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`);
  return (await response.json()) as T;
}
