import { PencilLine, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { LANGUAGES, type Language } from '../../domain/word.ts';
import { morph } from '../../shared/ui/morph.ts';
import { openSheetEnds } from '../../shared/ui/sheet.tsx';
import styles from './composer.module.css';

/**
 * The big line at the top: type a word, press + or Enter, and the + grows into
 * the sheet with the word flying up into it. With nothing typed, + just points
 * you back at the line.
 */
export function Composer({ language, onAdd }: { language: Language; onAdd: (term: string) => void }) {
  const [term, setTerm] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const name = LANGUAGES[language].name;
  const label = `Add ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} word`;
  const ready = term.trim() !== '';

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) {
          input.current!.focus();
          return;
        }
        morph(
          { box: add.current!, term: input.current },
          () => {
            setTerm('');
            onAdd(term.trim());
          },
          openSheetEnds,
        );
      }}
    >
      <PencilLine className={styles.icon} aria-hidden="true" />
      <input
        ref={input}
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
      <button ref={add} type="submit" className={styles.add} data-ready={ready || undefined} data-composer-add aria-label="Add word">
        <Plus aria-hidden="true" />
      </button>
    </form>
  );
}

/** The + button, which a cancelled new word's sheet shrinks back into. */
export function composerAddButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-composer-add]');
}
