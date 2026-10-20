import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Account } from '@blitz/core/sync.ts';
import { useCallback, useEffect, useState } from 'react';
import { API, api, authToken, loadToken, saveToken } from './api.ts';
import { changed, getJson, setJson } from './db.ts';
import { clearLocalData, flush, startSync, stopSync } from './sync.ts';

export type AccountState = { status: 'loading' } | { status: 'guest' } | { status: 'signed-in'; account: Account };

const KEY = 'account';

/** The last account seen, so a signed-in device opened offline still knows whose it is. */
const remembered = () => getJson<Account>(KEY);

function remember(account: Account | null) {
  setJson(KEY, account);
  changed();
}

/** 43 base64url characters, the shape the Worker expects of a verifier. */
function verifier(): string {
  return btoa(String.fromCharCode(...Crypto.getRandomBytes(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Google only redirects to a registered https origin, and a phone cannot keep
 * the cookie the web app signs in with. So the system browser does the normal
 * sign-in and comes back on `blitz://auth` with a single-use ticket, which the
 * app trades for a token it keeps in the keychain. See `worker/app-auth.ts`.
 */
async function signInWithGoogle(): Promise<Account> {
  const made = verifier();
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, made);
  const redirect = Linking.createURL('auth');
  const result = await WebBrowser.openAuthSessionAsync(
    `${API}/api/auth/app/start?scheme=blitz&challenge=${challenge}`,
    redirect,
  );
  if (result.type !== 'success') throw new Error('cancelled');

  const { queryParams } = Linking.parse(result.url);
  if (typeof queryParams?.error === 'string') throw new Error(queryParams.error);
  const ticket = queryParams?.ticket;
  if (typeof ticket !== 'string') throw new Error('failed');

  const response = await fetch(`${API}/api/auth/app/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, verifier: made }),
  });
  if (!response.ok) throw new Error('failed');
  const { token, account } = (await response.json()) as { token: string; account: Account };
  await saveToken(token);
  return account;
}

/** Who is signed in, and the actions that change it. Sync follows the account. */
export function useAccount() {
  const [state, setState] = useState<AccountState>(() => {
    const account = remembered();
    return account ? { status: 'signed-in', account } : { status: 'loading' };
  });
  const [signingIn, setSigningIn] = useState(false);

  const becomeGuest = useCallback(() => {
    void saveToken(null);
    remember(null);
    stopSync();
    setState({ status: 'guest' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await loadToken();
      if (!token) {
        if (!cancelled) setState((current) => (current.status === 'loading' ? { status: 'guest' } : current));
        return;
      }
      try {
        const response = await api('/api/me');
        if (!response.ok) throw new Error(String(response.status));
        const { account } = (await response.json()) as { account: Account | null };
        if (cancelled) return;
        remember(account);
        setState(account ? { status: 'signed-in', account } : { status: 'guest' });
        if (!account) await saveToken(null);
      } catch {
        // Offline: keep whatever was remembered, so the words stay usable.
        if (!cancelled) setState((current) => (current.status === 'loading' ? { status: 'guest' } : current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accountId = state.status === 'signed-in' ? state.account.id : null;
  useEffect(() => {
    if (!accountId) return;
    void startSync(accountId, becomeGuest);
    return () => stopSync();
  }, [accountId, becomeGuest]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (signingIn) return false;
    setSigningIn(true);
    try {
      const account = await signInWithGoogle();
      remember(account);
      setState({ status: 'signed-in', account });
      if (!authToken()) await loadToken();
      return true;
    } catch (error) {
      // Cancelling is not a failure, and says nothing.
      if (String(error).includes('cancelled')) return false;
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, [signingIn]);

  /**
   * Sends what is left, then signs out and clears this device: the words stay
   * safe in the account, and the next person to sign in here starts clean.
   */
  const signOut = useCallback(async (): Promise<boolean> => {
    const flushed = await flush().catch(() => false);
    if (!flushed) return false;
    await api('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined);
    stopSync();
    clearLocalData();
    await saveToken(null);
    remember(null);
    setState({ status: 'guest' });
    return true;
  }, []);

  /** Deletes the account and everything in it, for good. */
  const deleteAccount = useCallback(async (): Promise<void> => {
    const response = await api('/api/account', { method: 'DELETE' });
    if (!response.ok) throw new Error(String(response.status));
    stopSync();
    clearLocalData();
    await saveToken(null);
    remember(null);
    setState({ status: 'guest' });
  }, []);

  return { state, signIn, signOut, deleteAccount, signingIn };
}
