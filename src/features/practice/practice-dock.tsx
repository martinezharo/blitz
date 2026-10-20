import { Play } from 'lucide-react';
import { lessonLength } from '@blitz/core/practice.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './practice-dock.module.css';

/** The way into practice. Shut until the language has a word to ask about. */
export function PracticeDock({ words, onStart }: { words: number; onStart: () => void }) {
  const ready = words > 0;

  return (
    <div className={styles.dock}>
      <button
        type="button"
        className={styles.cta}
        aria-disabled={!ready}
        onClick={() => {
          if (!ready) return sounds.nudge();
          sounds.start();
          onStart();
        }}
      >
        <span className={styles.text}>
          <strong>Practice</strong>
          <small>{ready ? `${lessonLength(words)} quick questions` : 'Add a word first'}</small>
        </span>
        <span className={styles.go} aria-hidden="true">
          <Play />
        </span>
      </button>
    </div>
  );
}
