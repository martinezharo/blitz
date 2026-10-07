import { useState } from 'react';
import { useLanguage } from './data/preferences.ts';
import { useWords } from './data/words.ts';
import type { Word } from './domain/word.ts';
import styles from './app.module.css';
import { LanguageMenu } from './features/language/language-menu.tsx';
import { PracticeDock } from './features/practice/practice-dock.tsx';
import { Composer } from './features/words/composer.tsx';
import { WordList } from './features/words/word-list.tsx';
import { WordSheet } from './features/words/word-sheet.tsx';

type Editing = { term: string } | { word: Word } | null;

export function App() {
  const [language, setLanguage] = useLanguage();
  const words = useWords(language);
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <>
      <div className={styles.corner}>
        <LanguageMenu language={language} onChange={setLanguage} />
      </div>

      <main className={styles.page}>
        <Composer language={language} onAdd={(term) => setEditing({ term })} />
        {words && <WordList language={language} words={words} onOpen={(word) => setEditing({ word })} />}
      </main>

      <PracticeDock />

      {editing && (
        <WordSheet
          // A fresh sheet per word, so no draft leaks from one to the next.
          key={'word' in editing ? editing.word.id : 'new'}
          language={language}
          {...editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
