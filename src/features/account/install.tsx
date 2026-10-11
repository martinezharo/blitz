import { Download, Share } from 'lucide-react';
import { install, useInstallMode } from '../../data/install.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './account.module.css';

function promptInstall() {
  sounds.open();
  void install();
}

/**
 * The top-right corner on wide screens, left of the account menu. Narrow
 * screens put install inside that menu instead; see `InstallOption`.
 */
export function InstallButton() {
  const mode = useInstallMode();
  // Phones and tablets that cannot prompt get instructions in the menu, not a button that does nothing.
  if (mode !== 'native') return null;
  return (
    <button
      className={`${styles.badge} ${styles.guestBadge} ${styles.iconBadge} ${styles.installBadge} ${styles.desktopOnly}`}
      type="button"
      onClick={promptInstall}
      aria-label="Install Blitz"
    >
      <Download aria-hidden="true" />
    </button>
  );
}

/** Install inside the account menu, on narrow screens; wide ones have the corner button. */
export function InstallOption({ onChosen }: { onChosen: () => void }) {
  const mode = useInstallMode();
  if (mode === 'manual') {
    return (
      <p className={styles.menuStatus}>
        <Share aria-hidden="true" />
        To install, tap Share, then Add to Home Screen
      </p>
    );
  }
  if (mode !== 'native') return null;
  return (
    <button
      type="button"
      className={`${styles.menuOption} ${styles.mobileOnly}`}
      onClick={() => {
        // Closed by hand: installing removes this button before a popover target could act.
        onChosen();
        promptInstall();
      }}
    >
      <Download aria-hidden="true" />
      Install app
    </button>
  );
}
