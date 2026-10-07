import { Play } from 'lucide-react';
import styles from './practice-dock.module.css';

/** The way into practice. Practice itself is not built yet, so it stays shut. */
export function PracticeDock() {
  return (
    <div className={styles.dock}>
      <button type="button" className={styles.cta} aria-disabled="true">
        <span className={styles.text}>
          <strong>Practice</strong>
          <small>Coming soon</small>
        </span>
        <span className={styles.go} aria-hidden="true">
          <Play />
        </span>
      </button>
    </div>
  );
}
