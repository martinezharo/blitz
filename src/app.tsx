import { useState } from 'react';
import { useAccount } from './data/account.ts';
import { useLanguage, useTheme } from './data/preferences.ts';
import { useWords } from './data/words.ts';
import type { Word } from './domain/word.ts';
import styles from './app.module.css';
import { AccountBadge } from './features/account/account-badge.tsx';
import { AuthModal } from './features/account/auth-modal.tsx';
import { LanguageMenu } from './features/language/language-menu.tsx';
import { PreferencesModal } from './features/preferences/preferences-modal.tsx';
import { PracticeDock } from './features/practice/practice-dock.tsx';
import { PracticeSession } from './features/practice/practice-session.tsx';
import { Composer } from './features/words/composer.tsx';
import { WordList } from './features/words/word-list.tsx';
import { WordSheet } from './features/words/word-sheet.tsx';

type Editing = { term: string } | { word: Word } | null;

const SIGN_IN_ERRORS: Record<string, string | null> = {
  failed: "Google couldn't sign you in. Try again.",
  unavailable: 'Signing in is not set up on this server yet.',
  cancelled: null,
};

/**
 * Google sends people back with `?signin=<outcome>` when something went
 * wrong. Read once, then dropped from the address bar.
 */
function takeSignInOutcome(): { open: boolean; error: string | null } {
  const url = new URL(window.location.href);
  const outcome = url.searchParams.get('signin');
  if (outcome === null) return { open: false, error: null };
  url.searchParams.delete('signin');
  window.history.replaceState(window.history.state, '', url);
  return { open: true, error: SIGN_IN_ERRORS[outcome] ?? SIGN_IN_ERRORS.failed! };
}

export function App() {
  const [language, setLanguage] = useLanguage();
  const words = useWords(language);
  const [editing, setEditing] = useState<Editing>(null);
  const { state: account, signIn, signOut } = useAccount();
  const [auth, setAuth] = useState(takeSignInOutcome);
  const [theme, setTheme] = useTheme();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [practicing, setPracticing] = useState(false);

  return (
    <>
      <div className={styles.corner}>
        <LanguageMenu language={language} onChange={setLanguage} />
      </div>
      <div className={styles.cornerEnd}>
        <AccountBadge
          state={account}
          onSignIn={() => setAuth({ open: true, error: null })}
          onSignOut={signOut}
          onOpenPreferences={() => setPreferencesOpen(true)}
        />
      </div>

      <main className={styles.page}>
        <Composer language={language} onAdd={(term) => setEditing({ term })} />
        {words && <WordList language={language} words={words} onOpen={(word) => setEditing({ word })} />}
      </main>

      <PracticeDock words={words?.length ?? 0} onStart={() => setPracticing(true)} />

      {practicing && words && (
        <PracticeSession
          // A new lesson whenever the language changes under it.
          key={language}
          language={language}
          words={words}
          onClose={() => setPracticing(false)}
        />
      )}

      {editing && (
        <WordSheet
          // A fresh sheet per word, so no draft leaks from one to the next.
          key={'word' in editing ? editing.word.id : 'new'}
          language={language}
          {...editing}
          onClose={() => setEditing(null)}
        />
      )}

      {preferencesOpen && <PreferencesModal theme={theme} onThemeChange={setTheme} onDismiss={() => setPreferencesOpen(false)} />}

      {auth.open && account.status !== 'signed-in' && (
        <AuthModal error={auth.error} onSignIn={signIn} onDismiss={() => setAuth({ open: false, error: null })} />
      )}
    </>
  );
}
