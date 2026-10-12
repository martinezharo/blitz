import { BookOpen, Ellipsis, PenLine, Play } from 'lucide-react';
import { sounds } from '../../shared/sound.ts';
import { APP_MENU } from '../account/account-badge.tsx';
import styles from './nav.module.css';

/** The two pages of a language: its words, and free writing. Practice opens over either. */
export type View = 'words' | 'write';

const VIEWS: { value: View; label: string; Icon: typeof BookOpen }[] = [
  { value: 'words', label: 'Words', Icon: BookOpen },
  { value: 'write', label: 'Write', Icon: PenLine },
];

interface NavProps {
  view: View;
  onView: (view: View) => void;
}

/** Words or Write, like the theme picker: a pill slides under the page that is open. Wide screens only. */
function PageSwitch({ view, onView }: NavProps) {
  return (
    <div className={styles.switch} data-view={view} role="group" aria-label="Page">
      {VIEWS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => {
            if (value === view) return;
            sounds.toggle(value === 'words');
            onView(value);
            window.scrollTo({ top: 0 });
          }}
        >
          <Icon aria-hidden="true" />
          <strong>{label}</strong>
        </button>
      ))}
    </div>
  );
}

/** Wide screens: the pages at the top, between the language and the account. */
export function ViewSwitch(props: NavProps) {
  return (
    <nav className={styles.top} aria-label="Pages">
      <PageSwitch {...props} />
    </nav>
  );
}

/**
 * Phones: a bar along the bottom, in thumb's reach. The two pages, the way
 * into practice, and the menu the top-right corner holds on wide screens.
 */
export function TabBar({ view, onView, practice, onPractice }: NavProps & { practice: boolean; onPractice: () => void }) {
  const [words, write] = VIEWS as [(typeof VIEWS)[number], (typeof VIEWS)[number]];
  const page = ({ value, label, Icon }: (typeof VIEWS)[number]) => (
    <button
      type="button"
      className={styles.tab}
      aria-current={view === value ? 'page' : undefined}
      onClick={() => {
        if (value === view) return;
        sounds.tap();
        onView(value);
        window.scrollTo({ top: 0 });
      }}
    >
      <span className={styles.icon}>
        <Icon aria-hidden="true" />
      </span>
      {label}
    </button>
  );

  return (
    <nav className={styles.bar} aria-label="Pages">
      {page(words)}
      <button
        type="button"
        className={`${styles.tab} ${styles.practice}`}
        aria-disabled={!practice}
        aria-label={practice ? 'Practice' : 'Practice: add a word first'}
        onClick={() => {
          if (!practice) return sounds.nudge();
          sounds.start();
          onPractice();
        }}
      >
        <span className={styles.icon}>
          <Play aria-hidden="true" />
        </span>
        Practice
      </button>
      {page(write)}
      <button type="button" className={styles.tab} popoverTarget={APP_MENU} onClick={() => sounds.open()}>
        <span className={styles.icon}>
          <Ellipsis aria-hidden="true" />
        </span>
        Menu
      </button>
    </nav>
  );
}
