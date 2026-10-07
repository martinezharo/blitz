import { PencilLine, Plus } from 'lucide-react';
import { useState } from 'react';
import { LANGUAGES, type Language } from '../../domain/word.ts';
import styles from './composer.module.css';

/** The big line at the top: type a word, press + or Enter, finish it in the sheet. */
export function Composer({ language, onAdd }: { language: Language; onAdd: (term: string) => void }) {
  const [term, setTerm] = useState('');
  const name = LANGUAGES[language].name;
  const label = `Add ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} word`;

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(term.trim());
        setTerm('');
      }}
    >
      <PencilLine className={styles.icon} aria-hidden="true" />
      <input
        className={styles.input}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={label}
        aria-label={label}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        lang={language}
        enterKeyHint="next"
      />
      <button type="submit" className={styles.add} aria-label="Add word">
        <Plus aria-hidden="true" />
      </button>
    </form>
  );
}
