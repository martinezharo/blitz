import { useCallback, useEffect, useState } from 'react';
import type { Account } from '../domain/sync.ts';
import { clearLocalData, flush, startSync, stopSync } from './sync.ts';

export type AccountState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'signed-in'; account: Account };

const KEY = 'blitz.account';

/** The last account seen, so a signed-in device opened offline still knows whose it is. */
function remembered(): Account | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Account | null;
  } catch {
    return null;
  }
}

function remember(account: Account | null) {
  try {
    if (account) localStorage.setItem(KEY, JSON.stringify(account));
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered; the next visit asks the server again.
  }
}

/** Who is signed in, and the actions that change it. Sync follows the account. */
export function useAccount() {
  const [state, setState] = useState<AccountState>(() => {
    const account = remembered();
    return account ? { status: 'signed-in', account } : { status: 'loading' };
  });

  const becomeGuest = useCallback(() => {
    remember(null);
    stopSync();
    setState({ status: 'guest' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`/api/me failed with ${response.status}`);
        const { account } = (await response.json()) as { account: Account | null };
        if (cancelled) return;
        remember(account);
        setState(account ? { status: 'signed-in', account } : { status: 'guest' });
      })
      .catch(() => {
        // Offline or no server: keep whatever was remembered.
        if (!cancelled) setState((current) => (current.status === 'loading' ? { status: 'guest' } : current));
      });
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

  const signIn = useCallback(() => {
    window.location.assign('/api/auth/google');
  }, []);

  /**
   * Sends what is left, then signs out and clears this device: the words stay
   * safe in the account, and the next person to sign in here starts clean.
   * Resolves false when the user chose to stay signed in.
   */
  const signOut = useCallback(async (): Promise<boolean> => {
    const flushed = await flush().catch(() => false);
    if (!flushed && !window.confirm('Some changes have not synced yet and will be lost. Sign out anyway?')) {
      return false;
    }
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    stopSync();
    await clearLocalData();
    remember(null);
    setState({ status: 'guest' });
    return true;
  }, []);

  return { state, signIn, signOut };
}
