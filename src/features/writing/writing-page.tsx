import { Check, LoaderCircle, LogIn, PenLine, Plus, RotateCcw, SpellCheck2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { AccountState } from '../../data/account.ts';
import { lookupForm } from '../../data/dictionary.ts';
import { type CheckFailure, checkText, loadDraft, saveCorrections, storeDraft, type WritingDraft } from '../../data/writing.ts';
import { GUESS_NAMES, type Guess, guessLanguage } from '../../domain/detect-language.ts';
import { normalize, type Suggestion } from '../../domain/dictionary.ts';
import { LANGUAGES, type Language, type Word } from '../../domain/word.ts';
import { type Mark, MAX_TEXT, segments, sentenceFixes, type Verdict } from '../../domain/writing.ts';
import { sounds } from '../../shared/sound.ts';
import type { NewWord } from '../words/composer.tsx';
import { History } from './history.tsx';
import { type Mismatch, MismatchSheet } from './mismatch-sheet.tsx';
import styles from './writing.module.css';

/** A question to start from, in the language being written. */
const PROMPTS: Record<Language, string> = {
  de: 'Was hast du heute gemacht?',
  en: 'What did you do today?',
};

const FAILURES: Record<Exclude<CheckFailure, 'signed-out'>, string> = {
  'too-long': `That is a lot to check at once. Keep it under ${MAX_TEXT} characters.`,
  limit: 'That was the last check for today. Come back tomorrow for more.',
  offline: 'You are offline. Checking needs a connection.',
  failed: 'It could not be checked this time. Try again in a moment.',
};

interface WritingPageProps {
  language: Language;
  /** Everything saved in the language, to tell which corrected words are already there. */
  words: Word[] | undefined;
  account: AccountState;
  onSignIn: () => void;
  /** Opens a new word's sheet, growing out of `from`. */
  onAddWord: (word: NewWord, from: HTMLElement) => void;
  /** Moves the text to another language's page and checks it there. */
  onSwitchLanguage: (language: Language, text: string) => void;
  /** Check what is on the page as soon as it opens: it was just moved here. */
  autoCheck: boolean;
}

/**
 * Free writing. Write anything in the language, press Check, and the mistakes
 * are marked: spelling in one colour, grammar in another. A word written wrong
 * can be saved once it is corrected; a sentence with a grammar mistake goes
 * into the history, as written and as it should be.
 */
export function WritingPage({ language, words, account, onSignIn, onAddWord, onSwitchLanguage, autoCheck }: WritingPageProps) {
  const spec = LANGUAGES[language];
  const [draft, setDraft] = useState<WritingDraft>(() => loadDraft(language));
  // Checked text is shown marked; Edit goes back to the plain text.
  const [editing, setEditing] = useState(draft.marks === null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<CheckFailure | null>(null);
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => storeDraft(language, draft), [language, draft]);

  const signedIn = account.status === 'signed-in';
  const marks = draft.marks;
  const showMarks = marks !== null && !editing;

  function write(text: string) {
    // Any change makes the marks stale.
    setDraft({ text, marks: null });
    setFailure(null);
  }

  async function check() {
    const text = draft.text;
    if (checking) return;
    if (!text.trim()) {
      sounds.nudge();
      field.current?.focus();
      return;
    }
    // Already checked and not changed since: just show it again.
    if (draft.marks) {
      sounds.tap();
      setEditing(false);
      return;
    }
    if (!signedIn) {
      sounds.nudge();
      setFailure('signed-out');
      return;
    }
    const guess = guessLanguage(text);
    if (guess && guess !== language) {
      sounds.nudge();
      setMismatch(mismatchOf(guess));
      return;
    }

    setChecking(true);
    setFailure(null);
    const outcome = await checkText(language, text);
    setChecking(false);
    if (!outcome.ok) {
      sounds.nudge();
      setFailure(outcome.failure);
      return;
    }
    if (outcome.language !== language) {
      sounds.nudge();
      setMismatch(mismatchOf(outcome.language));
      return;
    }
    setDraft({ text, marks: outcome.marks });
    setEditing(false);
    setSelected(null);
    if (outcome.marks.length === 0) sounds.correct();
    else sounds.open();
    void saveCorrections(language, sentenceFixes(text, outcome.marks)).catch(() => {});
  }

  function mismatchOf(found: Guess | Verdict): Mismatch {
    if (found === 'de' || found === 'en') return { kind: 'switch', to: found };
    if (found === 'nonsense') return { kind: 'nonsense' };
    return { kind: 'unsupported', name: found === 'other' ? null : GUESS_NAMES[found] };
  }

  // Moved here from another language: checked right away, once.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!autoCheck || autoChecked.current) return;
    autoChecked.current = true;
    void check();
  }, [autoCheck]);

  function select(index: number) {
    sounds.tap();
    setSelected(index);
    cards.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Write</h1>
      <p className={styles.lede}>
        Write anything in {spec.name}. Check it, and Blitz marks what to fix.
      </p>

      <div className={styles.paper} data-checking={checking || undefined}>
        {showMarks ? (
          <p className={styles.marked} lang={language}>
            {segments(draft.text, marks).map((segment, index) =>
              segment.mark ? (
                <button
                  key={index}
                  type="button"
                  className={styles.mark}
                  data-kind={segment.mark.kind}
                  aria-pressed={selected === marks.indexOf(segment.mark)}
                  onClick={() => select(marks.indexOf(segment.mark!))}
                >
                  {segment.text}
                </button>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
        ) : (
          <textarea
            ref={field}
            className={styles.field}
            value={draft.text}
            onChange={(event) => write(event.target.value)}
            readOnly={checking}
            placeholder={PROMPTS[language]}
            aria-label={`Your text in ${spec.name}`}
            maxLength={MAX_TEXT}
            lang={language}
            // The browser's own spelling marks would give the answers away.
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void check();
              }
            }}
          />
        )}

        <div className={styles.tools}>
          {showMarks ? (
            <>
              <button
                type="button"
                className={styles.quiet}
                onClick={() => {
                  sounds.tap();
                  setEditing(true);
                  requestAnimationFrame(() => field.current?.focus());
                }}
              >
                <PenLine aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                className={styles.quiet}
                onClick={() => {
                  sounds.lift();
                  write('');
                  setEditing(true);
                  requestAnimationFrame(() => field.current?.focus());
                }}
              >
                <RotateCcw aria-hidden="true" />
                New text
              </button>
            </>
          ) : (
            <>
              <span className={styles.count} data-near={draft.text.length > MAX_TEXT * 0.85 || undefined}>
                {draft.text.length > MAX_TEXT * 0.6 ? `${draft.text.length} / ${MAX_TEXT}` : ''}
              </span>
              <button type="button" className={styles.check} onClick={() => void check()} aria-disabled={!draft.text.trim() || undefined}>
                {checking ? 'Checking…' : 'Check'}
                <span className={styles.checkIcon} aria-hidden="true">
                  {checking ? <LoaderCircle className={styles.spin} /> : <SpellCheck2 />}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {failure === 'signed-out' ? (
        <div className={styles.notice}>
          <p>Checking uses a language model, so it needs an account. It is free.</p>
          <button
            type="button"
            className={styles.quiet}
            onClick={() => {
              sounds.open();
              onSignIn();
            }}
          >
            <LogIn aria-hidden="true" />
            Sign in
          </button>
        </div>
      ) : (
        failure && (
          <p className={styles.notice} role="alert">
            {FAILURES[failure]}
          </p>
        )
      )}

      {showMarks && (
        <Results
          language={language}
          marks={marks}
          words={words}
          selected={selected}
          cards={cards}
          onSelect={setSelected}
          onAddWord={onAddWord}
        />
      )}

      <History language={language} />

      {mismatch && (
        <MismatchSheet
          language={language}
          mismatch={mismatch}
          onSwitch={(to) => {
            setMismatch(null);
            onSwitchLanguage(to, draft.text);
          }}
          onClose={() => {
            sounds.close();
            setMismatch(null);
          }}
        />
      )}
    </div>
  );
}

/** What a word written wrong is in the dictionary, and whether it is saved already. */
interface Found {
  suggestion: Suggestion | null;
  saved: boolean;
}

function Results({
  language,
  marks,
  words,
  selected,
  cards,
  onSelect,
  onAddWord,
}: {
  language: Language;
  marks: Mark[];
  words: Word[] | undefined;
  selected: number | null;
  cards: RefObject<(HTMLLIElement | null)[]>;
  onSelect: (index: number) => void;
  onAddWord: (word: NewWord, from: HTMLElement) => void;
}) {
  const [found, setFound] = useState<Map<string, Suggestion | null>>(new Map());
  const spelling = marks.filter((mark) => mark.kind === 'spelling').length;
  const grammar = marks.length - spelling;

  useEffect(() => {
    let current = true;
    const forms = [...new Set(marks.flatMap((mark) => (mark.word ? [mark.word] : [])))];
    void Promise.all(forms.map(async (form) => [form, await lookupForm(language, form)] as const)).then((pairs) => {
      if (current) setFound(new Map(pairs));
    });
    return () => {
      current = false;
    };
  }, [language, marks]);

  const saved = new Set((words ?? []).map((word) => normalize(word.term)));
  const lookup = (form: string): Found => {
    const suggestion = found.get(form) ?? null;
    return { suggestion, saved: saved.has(normalize(suggestion?.term ?? form)) };
  };

  if (marks.length === 0) {
    return (
      <p className={styles.clean}>
        <Check aria-hidden="true" />
        Nothing to fix. Nicely written!
      </p>
    );
  }

  return (
    <section className={styles.results} aria-label="Mistakes">
      <p className={styles.summary}>
        <strong>{marks.length === 1 ? '1 thing to fix' : `${marks.length} things to fix`}</strong>
        {spelling > 0 && <span data-kind="spelling">{spelling} spelling</span>}
        {grammar > 0 && <span data-kind="grammar">{grammar} grammar</span>}
      </p>
      <ol className={styles.cards}>
        {marks.map((mark, index) => {
          // Shown once the dictionary has answered, so the word does not change under the finger.
          const word = mark.word && found.has(mark.word) ? lookup(mark.word) : null;
          return (
            <li
              key={`${mark.start}-${mark.end}`}
              ref={(element) => {
                cards.current[index] = element;
              }}
              className={styles.card}
              data-kind={mark.kind}
              aria-current={selected === index || undefined}
              onPointerEnter={() => onSelect(index)}
            >
              <span className={styles.kind}>{mark.kind}</span>
              <p className={styles.change} lang={language}>
                <s>{mark.wrong}</s>
                <span aria-hidden="true">→</span>
                <ins>{mark.right}</ins>
              </p>
              {mark.why && <p className={styles.why}>{mark.why}</p>}
              {mark.word && word && (
                <div className={styles.save}>
                  {word.saved ? (
                    <span className={styles.saved}>
                      <Check aria-hidden="true" />
                      <span>
                        <strong lang={language}>{word.suggestion?.term ?? mark.word}</strong> is in your words
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.add}
                      onClick={(event) =>
                        onAddWord(
                          word.suggestion ? { term: word.suggestion.term, suggestion: word.suggestion } : { term: mark.word! },
                          event.currentTarget,
                        )
                      }
                    >
                      <Plus aria-hidden="true" />
                      <span>
                        Add <strong lang={language}>{word.suggestion?.term ?? mark.word}</strong> to your words
                      </span>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
