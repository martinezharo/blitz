import { Cloud, CloudOff, LoaderCircle, LogIn, LogOut, RefreshCw, Settings2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AccountState } from '../../data/account.ts';
import { type SyncStatus, syncNow, useSyncState } from '../../data/sync.ts';
import type { Account } from '../../domain/sync.ts';
import styles from './account.module.css';
import { InstallOption } from './install.tsx';

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
  onOpenPreferences,
}: {
  state: AccountState;
  onSignIn: () => void;
  onSignOut: () => Promise<boolean>;
  onOpenPreferences: () => void;
}) {
  if (state.status === 'loading') return null;
  if (state.status === 'guest') {
    return (
      <>
        <button
          className={`${styles.badge} ${styles.guestBadge} ${styles.iconBadge}`}
          type="button"
          onClick={onOpenPreferences}
          aria-label="Preferences"
        >
          <Settings2 aria-hidden="true" />
        </button>
        <button className={`${styles.badge} ${styles.guestBadge}`} type="button" onClick={onSignIn} aria-label="Sign in to sync your words">
          <LogIn aria-hidden="true" />
          <strong>Sign in</strong>
        </button>
      </>
    );
  }
  return <AccountMenu account={state.account} onSignOut={onSignOut} onOpenPreferences={onOpenPreferences} />;
}

function AccountMenu({
  account,
  onSignOut,
  onOpenPreferences,
}: {
  account: Account;
  onSignOut: () => Promise<boolean>;
  onOpenPreferences: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const { status } = useSyncState();
  const name = firstName(account);
  const SyncIcon = syncIcon(status);

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
        <SignedInItems account={account} onSignOut={onSignOut} onOpenPreferences={onOpenPreferences} onChosen={() => menu.current?.hidePopover()} />
      </div>
    </>
  );
}

const firstName = (account: Account) => account.name?.split(' ')[0] || account.email.split('@')[0]!;
const syncIcon = (status: SyncStatus) =>
  status === 'syncing' ? LoaderCircle : status === 'offline' || status === 'error' ? CloudOff : Cloud;

/** What the account menu holds: who is signed in, how sync is going, and the way out. */
function SignedInItems({
  account,
  onSignOut,
  onOpenPreferences,
  onChosen,
}: {
  account: Account;
  onSignOut: () => Promise<boolean>;
  onOpenPreferences: () => void;
  onChosen: () => void;
}) {
  const { status } = useSyncState();
  const [leaving, setLeaving] = useState(false);
  const SyncIcon = syncIcon(status);

  return (
    <>
      <div className={styles.menuHead}>
        <Avatar account={account} large />
        <div>
          <strong>{account.name ?? firstName(account)}</strong>
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
      <InstallOption onChosen={onChosen} />
      <button
        type="button"
        className={styles.menuOption}
        onClick={() => {
          onChosen();
          onOpenPreferences();
        }}
      >
        <Settings2 aria-hidden="true" />
        Preferences
      </button>
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
    </>
  );
}

/**
 * The same menu as the top-right corner, opened from the tab bar on phones,
 * where the corner is left to the language. Guests get sign-in in it too.
 */
export function AppMenu({
  state,
  onSignIn,
  onSignOut,
  onOpenPreferences,
}: {
  state: AccountState;
  onSignIn: () => void;
  onSignOut: () => Promise<boolean>;
  onOpenPreferences: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = () => menu.current?.hidePopover();
  return (
    <div ref={menu} id={APP_MENU} popover="auto" className={`${styles.menu} ${styles.appMenu}`}>
      {state.status === 'signed-in' ? (
        <SignedInItems account={state.account} onSignOut={onSignOut} onOpenPreferences={onOpenPreferences} onChosen={close} />
      ) : (
        <>
          <button
            type="button"
            className={styles.menuOption}
            onClick={() => {
              close();
              onSignIn();
            }}
          >
            <LogIn aria-hidden="true" />
            Sign in to sync your words
          </button>
          <InstallOption onChosen={close} />
          <button
            type="button"
            className={styles.menuOption}
            onClick={() => {
              close();
              onOpenPreferences();
            }}
          >
            <Settings2 aria-hidden="true" />
            Preferences
          </button>
        </>
      )}
    </div>
  );
}

/** The id of the tab bar's menu, for the button that opens it. */
export const APP_MENU = 'app-menu';

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
