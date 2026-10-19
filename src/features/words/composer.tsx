import { PencilLine, Plus } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { lookup } from '../../data/dictionary.ts';
import type { Suggestion } from '@blitz/core/dictionary.ts';
import { LANGUAGES, type Language } from '@blitz/core/word.ts';
import { sounds } from '../../shared/sound.ts';
import { morph } from '../../shared/ui/morph.ts';
import { openSheetEnds } from '../../shared/ui/sheet.tsx';
import styles from './composer.module.css';

/** What the new word's sheet opens with: what was typed, or the dictionary entry picked. */
export interface NewWord {
  term: string;
  suggestion?: Suggestion;
}

/**
 * The big line at the top: type a word, press + or Enter, and the + grows into
 * the sheet with the word flying up into it. With nothing typed, + just points
 * you back at the line.
 *
 * As you type, the dictionary offers words: the ones that start like it and,
 * for German, the ones that translate it, so either language finds the word.
 * Picking one opens the sheet already filled in. Under them, or alone when the
 * dictionary has nothing, a last option adds what was typed as a custom word.
 */
export function Composer({ language, onAdd }: { language: Language; onAdd: (word: NewWord) => void }) {
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // -1: nothing chosen, so Enter takes what was typed.
  // suggestions.length: the custom option under them, which also takes what was typed.
  const [highlighted, setHighlighted] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const name = LANGUAGES[language].name;
  const label = `Add ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} word`;
  const ready = term.trim() !== '';
  const open = focused && !hidden && ready;
  const custom = suggestions.length;

  useEffect(() => {
    let current = true;
    void lookup(language, term).then((found) => {
      if (!current) return;
      setSuggestions(found);
      setHighlighted(-1);
    });
    return () => {
      current = false;
    };
  }, [language, term]);

  function openSheet(word: NewWord) {
    sounds.open();
    morph(
      { box: add.current!, term: input.current },
      () => {
        setTerm('');
        onAdd(word);
      },
      openSheetEnds,
    );
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setHidden(true);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && ready) {
      event.preventDefault();
      setHidden(false);
      setFocused(true);
      // One stop past each end is "nothing chosen", back to what was typed.
      const stops = custom + 2;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((index) => ((index + 1 + step + stops) % stops) - 1);
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        const picked = open ? suggestions[highlighted] : undefined;
        if (picked) {
          openSheet({ term: picked.term, suggestion: picked });
        } else if (ready) {
          openSheet({ term: term.trim() });
        } else {
          sounds.nudge();
          input.current!.focus();
        }
      }}
    >
      <PencilLine className={styles.icon} aria-hidden="true" />
      <input
        ref={input}
        className={styles.input}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setHidden(false);
          // Typing means it has focus, even if the focus event was missed: a
          // closing sheet hands focus back while React is committing, and
          // React drops events fired then.
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && highlighted >= 0 ? `${listId}${highlighted}` : undefined}
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

      <div
        className={styles.suggestions}
        hidden={!open}
        // Keep the line focused while one is pressed, so the list does not close first.
        onPointerDown={(event) => event.preventDefault()}
      >
        <ul id={listId} className={styles.suggestionList} role="listbox" aria-label="Suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.term}${suggestion.type}${index}`}
              id={`${listId}${index}`}
              className={styles.suggestion}
              role="option"
              aria-selected={index === highlighted}
              data-article={suggestion.article ?? undefined}
              onPointerEnter={() => setHighlighted(index)}
              onClick={() => openSheet({ term: suggestion.term, suggestion })}
            >
              <span className={styles.title}>
                {LANGUAGES[language].articles && suggestion.article && <span className={styles.article}>{suggestion.article} </span>}
                {suggestion.term}
                {suggestion.plural && <span className={styles.plural}> pl. {suggestion.plural}</span>}
              </span>
              <span className={styles.type}>{suggestion.type}</span>
              <span className={styles.meaning}>{suggestion.translation ?? suggestion.definition}</span>
            </li>
          ))}
          <li
            id={`${listId}${custom}`}
            className={`${styles.suggestion} ${styles.custom}`}
            role="option"
            aria-selected={highlighted === custom}
            onPointerEnter={() => setHighlighted(custom)}
            onClick={() => openSheet({ term: term.trim() })}
          >
            <Plus className={styles.customIcon} aria-hidden="true" />
            <span className={styles.customLabel}>
              Add <strong>{term.trim()}</strong> as a custom word
            </span>
          </li>
        </ul>
      </div>
    </form>
  );
}

/** The + button, which a cancelled new word's sheet shrinks back into. */
export function composerAddButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-composer-add]');
}
