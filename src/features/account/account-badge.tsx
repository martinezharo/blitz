import { Cloud, CloudOff, LoaderCircle, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AccountState } from '../../data/account.ts';
import { type SyncStatus, syncNow, useSyncState } from '../../data/sync.ts';
import type { Account } from '../../domain/sync.ts';
import styles from './account.module.css';

const STATUS: Record<SyncStatus, string> = {
  off: 'Sync is off on this connection',
  syncing: 'Syncing…',
  synced: 'All words synced',
  offline: 'Offline. Will sync when you are back',
  error: 'Could not sync. Will try again',
};

/** The top-right corner: a "Sign in" badge for guests, the account for everyone else. */
export function AccountBadge({
  state,
  onSignIn,
  onSignOut,
}: {
  state: AccountState;
  onSignIn: () => void;
  onSignOut: () => Promise<boolean>;
}) {
  if (state.status === 'loading') return null;
  if (state.status === 'guest') {
    return (
      <button className={`${styles.badge} ${styles.guestBadge}`} type="button" onClick={onSignIn} aria-label="Sign in to sync your words">
        <LogIn aria-hidden="true" />
        <strong>Sign in</strong>
      </button>
    );
  }
  return <AccountMenu account={state.account} onSignOut={onSignOut} />;
}

function AccountMenu({ account, onSignOut }: { account: Account; onSignOut: () => Promise<boolean> }) {
  const menu = useRef<HTMLDivElement>(null);
  const { status } = useSyncState();
  const [leaving, setLeaving] = useState(false);
  const name = account.name?.split(' ')[0] || account.email.split('@')[0]!;
  const SyncIcon = status === 'syncing' ? LoaderCircle : status === 'offline' || status === 'error' ? CloudOff : Cloud;

  return (
    <>
      <button
        type="button"
        className={`${styles.badge} ${styles.guestBadge}`}
        popoverTarget="account-menu"
        aria-label={`Account: ${account.email}. ${STATUS[status]}`}
      >
        <Avatar account={account} />
        <strong>{name}</strong>
        <SyncIcon className={styles.syncIcon} data-status={status} aria-hidden="true" />
      </button>
      <div ref={menu} id="account-menu" popover="auto" className={styles.menu}>
        <div className={styles.menuHead}>
          <Avatar account={account} large />
          <div>
            <strong>{account.name ?? name}</strong>
            <small>{account.email}</small>
          </div>
        </div>
        <p className={styles.menuStatus} data-status={status}>
          <SyncIcon aria-hidden="true" />
          {STATUS[status]}
        </p>
        {(status === 'error' || status === 'offline') && (
          <button type="button" className={styles.menuOption} onClick={() => void syncNow()}>
            <RefreshCw aria-hidden="true" />
            Sync now
          </button>
        )}
        <button
          type="button"
          className={styles.menuOption}
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            const left = await onSignOut();
            if (!left) setLeaving(false);
          }}
        >
          <LogOut aria-hidden="true" />
          {leaving ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );
}

function Avatar({ account, large = false }: { account: Account; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const className = large ? `${styles.avatar} ${styles.avatarLarge}` : styles.avatar;
  if (account.picture && !broken) {
    return <img className={className} src={account.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return (
    <span className={className} aria-hidden="true">
      {(account.name ?? account.email).charAt(0).toUpperCase()}
    </span>
  );
}
