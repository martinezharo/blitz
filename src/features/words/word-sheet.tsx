import { Archive, ArchiveRestore, ImagePlus, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { compressPhoto } from '../../data/photo.ts';
import { lookupWord } from '../../data/dictionary.ts';
import { addWord, deleteWord, setArchived, updateWord } from '../../data/words.ts';
import { fillDraft, normalize, type Suggestion } from '../../domain/dictionary.ts';
import {
  type Draft,
  type DraftProblem,
  draftFromWord,
  draftProblems,
  emptyDraft,
  counterpartArticle,
  hasArticle,
  hasCounterpart,
  hasPlural,
  LANGUAGES,
  type Language,
  type Word,
  WORD_TYPES,
} from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import { Sheet } from '../../shared/ui/sheet.tsx';
import { useObjectUrl } from '../../shared/ui/use-object-url.ts';
import styles from './word-sheet.module.css';

const PROBLEM_TEXT: Record<DraftProblem, string> = {
  term: 'Write the word',
  type: 'Pick what kind of word it is',
  meaning: 'Give it a meaning',
};

/** Closes the sheet; `landOn` is the word it should settle into, if it still exists. */
type WordSheetProps = { language: Language; onClose: (landOn: string | null) => void } & (
  | { word: Word; term?: never; suggestion?: never }
  | { word?: never; term: string; suggestion?: Suggestion }
);

/** Adds a word, or edits one when `word` is given. */
export function WordSheet({ language, word, term, suggestion, onClose }: WordSheetProps) {
  const spec = LANGUAGES[language];
  const [draft, setDraft] = useState<Draft>(() => {
    if (word) return draftFromWord(word);
    return suggestion ? fillDraft(language, emptyDraft(suggestion.term), suggestion) : emptyDraft(term);
  });
  // A word picked from the dictionary is already filled in; a typed one is looked up.
  const [filled, setFilled] = useState(suggestion !== undefined);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoUrl = useObjectUrl(draft.photo);
  const ids = useId();

  const problems = draftProblems(language, draft);
  const showArticle = hasArticle(language, draft.type);
  const showPlural = hasPlural(draft.type);
  const showCounterpart = hasCounterpart(language, draft.type);
  const otherArticle = counterpartArticle(draft.article);
  const dismiss = () => {
    sounds.close();
    onClose(word?.id ?? null);
  };
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  // A new word that is typed, not picked, is filled in from the dictionary
  // once it settles on a word it knows. Only what is still empty is filled.
  const typed = word || suggestion ? null : draft.term;
  useEffect(() => {
    if (!typed) return;
    let current = true;
    const timer = setTimeout(() => {
      void lookupWord(language, typed).then((found) => {
        if (!current || !found) return;
        setDraft((now) => {
          // Typing went on while it was looked up.
          if (normalize(now.term) !== normalize(found.term)) return now;
          const next = fillDraft(language, { ...now, term: found.term }, found);
          if (next.type !== now.type) setFilled(true);
          return next;
        });
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [language, typed]);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (problems.length > 0 || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      if (word) await updateWord(word, draft);
      const saved = word ?? (await addWord(language, draft));
      sounds.saved();
      onClose(saved.id);
    } catch {
      sounds.nudge();
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!word) return;
    if (!confirmingDelete) {
      sounds.armed();
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteWord(word.id);
      sounds.deleted();
      onClose(null);
    } catch {
      sounds.nudge();
      setSaveError(true);
    }
  }

  async function toggleArchived() {
    if (!word) return;
    try {
      await setArchived(word, !word.archived);
      sounds.saved();
      onClose(null);
    } catch {
      sounds.nudge();
      setSaveError(true);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(false);
    try {
      set({ photo: await compressPhoto(file) });
      sounds.snap();
    } catch {
      sounds.nudge();
      setPhotoError(true);
    }
  }

  return (
    <Sheet
      eyebrow={`${spec.flag} ${spec.name}`}
      title={word ? 'Edit word' : 'New word'}
      onClose={dismiss}
      footer={
        <>
          {word ? (
            <button
              type="button"
              className={`${styles.button} ${styles.delete}`}
              data-confirming={confirmingDelete || undefined}
              onClick={remove}
              onBlur={() => setConfirmingDelete(false)}
            >
              <Trash2 aria-hidden="true" />
              {confirmingDelete ? 'Delete it' : <span className="sr-only">Delete</span>}
            </button>
          ) : (
            <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={dismiss}>
              Cancel
            </button>
          )}
          {word && (
            <button type="button" className={`${styles.button} ${styles.quiet} ${styles.archive}`} onClick={toggleArchived}>
              {word.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
              {word.archived ? 'Unarchive' : 'Archive'}
            </button>
          )}
          <button
            type="submit"
            form={`${ids}form`}
            className={`${styles.button} ${styles.main}`}
            disabled={problems.length > 0 || saving}
          >
            {word ? 'Save changes' : 'Save word'}
          </button>
        </>
      }
    >
      <form id={`${ids}form`} onSubmit={save} noValidate>
        <label className="sr-only" htmlFor={`${ids}term`}>
          Word
        </label>
        <input
          id={`${ids}term`}
          className={styles.term}
          value={draft.term}
          onChange={(event) => set({ term: event.target.value })}
          placeholder={`Word in ${spec.name}`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          lang={language}
          data-autofocus={!draft.term || undefined}
          data-morph-term
        />
        {filled && !word && <p className={styles.source}>Filled in from Wiktionary. Change anything.</p>}

        <fieldset className={styles.field}>
          <legend className={styles.label}>Type</legend>
          <div className={styles.picks}>
            {WORD_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={styles.pick}
                aria-pressed={draft.type === value}
                onClick={() => {
                  if (draft.type !== value) sounds.tap();
                  set({ type: value });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {(showArticle || showPlural) && (
          <div className={styles.noun}>
            {showArticle && (
              <fieldset className={styles.field}>
                <legend className={styles.label}>
                  Article <span className={styles.optional}>optional</span>
                </legend>
                <div className={styles.picks}>
                  {spec.articles!.map((article) => (
                    <button
                      key={article}
                      type="button"
                      className={styles.pick}
                      data-article={article}
                      aria-pressed={draft.article === article}
                      onClick={() => {
                        sounds.tap();
                        set({ article: draft.article === article ? null : article });
                      }}
                    >
                      {article}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {showPlural && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${ids}plural`}>
                  Plural<span className={styles.optional}>optional</span>
                </label>
                <input
                  id={`${ids}plural`}
                  className={styles.input}
                  value={draft.plural}
                  onChange={(event) => set({ plural: event.target.value })}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  lang={language}
                />
              </div>
            )}
            {showCounterpart && (
              <div className={`${styles.field} ${styles.counterpart}`}>
                <label className={styles.label} htmlFor={`${ids}counterpart`}>
                  {otherArticle === 'die' ? 'Female form' : otherArticle === 'der' ? 'Male form' : 'Form for the other sex'}
                  <span className={styles.optional}>optional</span>
                </label>
                <input
                  id={`${ids}counterpart`}
                  className={styles.input}
                  value={draft.counterpart}
                  onChange={(event) => set({ counterpart: event.target.value })}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  lang={language}
                />
              </div>
            )}
          </div>
        )}

        <div className={styles.meaning}>
          <p className={styles.meaningHint}>
            Meaning: fill {spec.translated ? 'at least one of these' : 'the definition, add a picture, or both'}.
          </p>

          {spec.translated && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${ids}translation`}>
                In English
              </label>
              <input
                id={`${ids}translation`}
                className={styles.input}
                value={draft.translation}
                onChange={(event) => set({ translation: event.target.value })}
                autoComplete="off"
                lang="en"
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${ids}definition`}>
              Definition
            </label>
            <div className={styles.textFrame}>
              <textarea
                id={`${ids}definition`}
                className={styles.textarea}
                value={draft.definition}
                onChange={(event) => set({ definition: event.target.value })}
                placeholder="Explain it in English, in your own words"
                rows={2}
                lang="en"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Picture</span>
            {photoUrl ? (
              <div className={styles.photo}>
                <img src={photoUrl} alt="" />
                <button type="button" className={styles.photoChange} onClick={() => fileInput.current?.click()}>
                  Change
                </button>
                <button
                  type="button"
                  className={styles.photoRemove}
                  onClick={() => {
                    sounds.lift();
                    set({ photo: null });
                  }}
                  aria-label="Remove picture"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button type="button" className={styles.photoEmpty} onClick={() => fileInput.current?.click()}>
                <span className={styles.photoIcon}>
                  <ImagePlus aria-hidden="true" />
                </span>
                <span>
                  <strong>Add a picture</strong>
                  {photoError ? 'That file could not be read. Try another one.' : 'Take a photo or choose one'}
                </span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void pickPhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        {saveError && (
          <p className={styles.error} role="alert">
            This browser would not save it. Try again.
          </p>
        )}
        {problems.length > 0 && <p className={styles.missing}>{PROBLEM_TEXT[problems[0]!]} to save it.</p>}
      </form>
    </Sheet>
  );
}
