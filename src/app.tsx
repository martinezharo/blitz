import { useEffect, useMemo, useState } from 'react';
import { useAccount } from './data/account.ts';
import { useLanguage, useSounds, useTheme, useWordSort } from './data/preferences.ts';
import { usePracticeDays } from './data/streak.ts';
import { fillCounterparts, useWords } from './data/words.ts';
import type { Word } from './domain/word.ts';
import styles from './app.module.css';
import { storeDraft } from './data/writing.ts';
import { AccountBadge, AppMenu } from './features/account/account-badge.tsx';
import { AuthModal } from './features/account/auth-modal.tsx';
import { InstallButton } from './features/account/install.tsx';
import { LanguageMenu } from './features/language/language-menu.tsx';
import { ListsPill } from './features/lists/lists-entry.tsx';
import { ListsPage } from './features/lists/lists-page.tsx';
import { TabBar, type View, ViewSwitch } from './features/nav/nav.tsx';
import { PreferencesModal } from './features/preferences/preferences-modal.tsx';
import { StreakBadge } from './features/streak/streak-badge.tsx';
import { PracticeDock } from './features/practice/practice-dock.tsx';
import { PracticeSession } from './features/practice/practice-session.tsx';
import { Composer, composerAddButton, type NewWord } from './features/words/composer.tsx';
import { WordList, wordRow } from './features/words/word-list.tsx';
import { WordSheet } from './features/words/word-sheet.tsx';
import { WritingPage } from './features/writing/writing-page.tsx';
import { sounds } from './shared/sound.ts';
import { trackPromoStep } from './shared/promo.ts';
import { morph, morphEndsIn, waitFor } from './shared/ui/morph.ts';
import { openSheetEnds } from './shared/ui/sheet.tsx';

type Editing = NewWord | { word: Word } | null;

const SIGN_IN_ERRORS: Record<string, string | null> = {
  failed: "Google couldn't sign you in. Try again.",
  unavailable: 'Signing in is not set up on this server yet.',
  cancelled: null,
};

/**
 * Google sends people back with `?signin=<outcome>`: `ok`, or what went
 * wrong. Read once, then dropped from the address bar.
 */
function takeSignInOutcome(): { open: boolean; error: string | null } {
  const url = new URL(window.location.href);
  const outcome = url.searchParams.get('signin');
  if (outcome === null) return { open: false, error: null };
  url.searchParams.delete('signin');
  window.history.replaceState(window.history.state, '', url);
  if (outcome === 'ok') {
    trackPromoStep('sign-in');
    return { open: false, error: null };
  }
  return { open: true, error: SIGN_IN_ERRORS[outcome] ?? SIGN_IN_ERRORS.failed! };
}

const VIEW_KEY = 'blitz.view';

/**
 * The page open in this window, so a reload (the app updating itself while
 * in the background) comes back to it. Per window: a fresh start opens Words.
 */
function storedView(): View {
  try {
    return sessionStorage.getItem(VIEW_KEY) === 'write' ? 'write' : 'words';
  } catch {
    return 'words';
  }
}

// How long the first paint waits for the words before showing what it has.
const DATA_PATIENCE_MS = 1000;

/**
 * Whether the page can be painted: once what it shows from IndexedDB has been
 * read, so it arrives whole instead of in pieces, the list and the streak
 * popping in a moment after the rest. Only the first time; a database that
 * takes too long (another tab holding it) gets the page without them.
 */
function useFirstPaint(loaded: boolean): boolean {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (ready) return;
    if (loaded) return setReady(true);
    const timer = setTimeout(() => setReady(true), DATA_PATIENCE_MS);
    return () => clearTimeout(timer);
  }, [loaded, ready]);
  return ready || loaded;
}

export function App() {
  const [language, setLanguage] = useLanguage();
  const [sort, setSort] = useWordSort();
  const words = useWords(language);
  // Archived words are out of practice and tucked away at the end of the list.
  const active = useMemo(() => words?.filter((word) => !word.archived), [words]);
  const practised = usePracticeDays();
  const [editing, setEditing] = useState<Editing>(null);
  const { state: account, signIn, signOut } = useAccount();
  const [auth, setAuth] = useState(takeSignInOutcome);
  const [theme, setTheme] = useTheme();
  const [soundsOn, setSoundsOn] = useSounds();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [browsingLists, setBrowsingLists] = useState(false);
  const [view, setView] = useState<View>(storedView);
  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, view);
    } catch {
      // Not kept, so a reload opens Words.
    }
  }, [view]);
  // A text just moved here from the other language's page, to be checked on arrival.
  const [autoCheck, setAutoCheck] = useState(false);
  useEffect(() => {
    if (autoCheck) setAutoCheck(false);
  }, [autoCheck]);

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
        // Words added while writing have no row on screen to settle into.
        if (view !== 'words') return null;
        if (landOn) return morphEndsIn(await waitFor(() => wordRow(landOn)));
        if (fresh) return morphEndsIn(composerAddButton());
        return null;
      },
    );
  }

  const openSignIn = () => {
    sounds.open();
    setAuth({ open: true, error: null });
  };
  const openPreferences = () => {
    sounds.open();
    setPreferencesOpen(true);
  };

  function openLists() {
    sounds.open();
    setBrowsingLists(true);
  }

  const painted = useFirstPaint(words !== undefined && practised !== undefined);
  // Nothing yet: the background, as before the app loaded.
  if (!painted) return null;

  return (
    <>
      <div className={styles.corner}>
        <LanguageMenu language={language} onChange={setLanguage} />
      </div>
      <div className={styles.cornerEnd}>
        <StreakBadge practised={practised} hold={practicing} />
        <div className={styles.wideOnly}>
          <InstallButton />
          <AccountBadge state={account} onSignIn={openSignIn} onSignOut={signOut} onOpenPreferences={openPreferences} />
        </div>
      </div>
      <ViewSwitch view={view} onView={setView} />

      <main className={styles.page}>
        {view === 'words' ? (
          <>
            <Composer language={language} onAdd={setEditing} />
            {words && words.length > 0 && <ListsPill onOpen={openLists} />}
            {words && (
              <WordList
                language={language}
                words={words}
                sort={sort}
                onSortChange={setSort}
                onOpen={(word) => setEditing({ word })}
                onBrowseLists={openLists}
              />
            )}
          </>
        ) : (
          <WritingPage
            // Each language has its own page and its own text.
            key={language}
            language={language}
            words={words}
            account={account}
            onSignIn={openSignIn}
            onAddWord={(word, from) => {
              sounds.open();
              morph({ box: from }, () => setEditing(word), openSheetEnds);
            }}
            onSwitchLanguage={(to, text) => {
              storeDraft(to, { text, marks: null });
              setLanguage(to);
              setAutoCheck(true);
            }}
            autoCheck={autoCheck}
          />
        )}
      </main>

      {view === 'words' && <PracticeDock words={active?.length ?? 0} onStart={() => setPracticing(true)} />}
      <TabBar view={view} onView={setView} practice={(active?.length ?? 0) > 0} onPractice={() => setPracticing(true)} />
      <AppMenu state={account} onSignIn={openSignIn} onSignOut={signOut} onOpenPreferences={openPreferences} />

      {practicing && active && (
        <PracticeSession
          // A new lesson whenever the language changes under it.
          key={language}
          language={language}
          words={active}
          onClose={() => setPracticing(false)}
        />
      )}

      {browsingLists && words && (
        <ListsPage
          // Lists follow the language: a new page whenever it changes under it.
          key={language}
          language={language}
          words={words}
          onClose={() => setBrowsingLists(false)}
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
