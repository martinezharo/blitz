import { useEffect, useMemo, useState } from 'react';
import { useAccount } from './data/account.ts';
import { useLanguage, useSounds, useTheme } from './data/preferences.ts';
import { fillCounterparts, useWords } from './data/words.ts';
import type { Word } from './domain/word.ts';
import styles from './app.module.css';
import { AccountBadge } from './features/account/account-badge.tsx';
import { AuthModal } from './features/account/auth-modal.tsx';
import { InstallButton } from './features/account/install.tsx';
import { LanguageMenu } from './features/language/language-menu.tsx';
import { PreferencesModal } from './features/preferences/preferences-modal.tsx';
import { PracticeDock } from './features/practice/practice-dock.tsx';
import { PracticeSession } from './features/practice/practice-session.tsx';
import { Composer, composerAddButton, type NewWord } from './features/words/composer.tsx';
import { WordList, wordRow } from './features/words/word-list.tsx';
import { WordSheet } from './features/words/word-sheet.tsx';
import { sounds } from './shared/sound.ts';
import { morph, morphEndsIn, waitFor } from './shared/ui/morph.ts';
import { openSheetEnds } from './shared/ui/sheet.tsx';

type Editing = NewWord | { word: Word } | null;

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
  // Archived words are out of practice and tucked away at the end of the list.
  const active = useMemo(() => words?.filter((word) => !word.archived), [words]);
  const [editing, setEditing] = useState<Editing>(null);
  const { state: account, signIn, signOut } = useAccount();
  const [auth, setAuth] = useState(takeSignInOutcome);
  const [theme, setTheme] = useTheme();
  const [soundsOn, setSoundsOn] = useSounds();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [practicing, setPracticing] = useState(false);

  useEffect(() => {
    if (words) void fillCounterparts(words);
  }, [words]);

  /**
   * The sheet settles into the word's row; a new word's row may take a moment
   * to show up. A cancelled new word shrinks back into the +.
   */
  function closeSheet(landOn: string | null) {
    const from = openSheetEnds();
    // Pulled off screen already: nothing left to morph.
    if (!from) {
      setEditing(null);
      return;
    }
    const fresh = editing !== null && !('word' in editing);
    morph(
      from,
      () => setEditing(null),
      async () => {
        if (landOn) return morphEndsIn(await waitFor(() => wordRow(landOn)));
        if (fresh) return morphEndsIn(composerAddButton());
        return null;
      },
    );
  }

  return (
    <>
      <div className={styles.corner}>
        <LanguageMenu language={language} onChange={setLanguage} />
      </div>
      <div className={styles.cornerEnd}>
        <InstallButton />
        <AccountBadge
          state={account}
          onSignIn={() => {
            sounds.open();
            setAuth({ open: true, error: null });
          }}
          onSignOut={signOut}
          onOpenPreferences={() => {
            sounds.open();
            setPreferencesOpen(true);
          }}
        />
      </div>

      <main className={styles.page}>
        <Composer language={language} onAdd={setEditing} />
        {words && <WordList language={language} words={words} onOpen={(word) => setEditing({ word })} />}
      </main>

      <PracticeDock words={active?.length ?? 0} onStart={() => setPracticing(true)} />

      {practicing && active && (
        <PracticeSession
          // A new lesson whenever the language changes under it.
          key={language}
          language={language}
          words={active}
          onClose={() => setPracticing(false)}
        />
      )}

      {editing && (
        <WordSheet
          // A fresh sheet per word, so no draft leaks from one to the next.
          key={'word' in editing ? editing.word.id : 'new'}
          language={language}
          {...editing}
          onClose={closeSheet}
        />
      )}

      {preferencesOpen && (
        <PreferencesModal
          theme={theme}
          onThemeChange={setTheme}
          // Guests have no account menu to hold it, so it lives here.
          showInstall={account.status === 'guest'}
          soundsOn={soundsOn}
          onSoundsChange={setSoundsOn}
          onDismiss={() => setPreferencesOpen(false)}
        />
      )}

      {auth.open && account.status !== 'signed-in' && (
        <AuthModal
          error={auth.error}
          onSignIn={signIn}
          onDismiss={() => {
            sounds.close();
            setAuth({ open: false, error: null });
          }}
        />
      )}
    </>
  );
}
