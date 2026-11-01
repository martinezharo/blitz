import { Archive, Check, Download, Mars, Venus, Volume2, X } from 'lucide-react';
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { markPracticed } from '../../data/streak.ts';
import { recordAnswer, setArchived } from '../../data/words.ts';
import { type Answer, buildExercise, type Exercise, fillLetters, isCorrect, offersArchive, pickLesson, sameText, STREAK_TO_ARCHIVE } from '../../domain/practice.ts';
import { LANGUAGES, type Language, type Word } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import { canHear, downloadVoice, preloadSpeech, prepareVoice, speak, useVoice } from '../../shared/speech/speech.ts';
import { useKeyboardFit } from '../../shared/ui/use-keyboard-fit.ts';
import { shownPhoto, useObjectUrl, usePreloadedImage } from '../../shared/ui/use-object-url.ts';
import { emptySlots, LetterBoard, type Slots } from './letter-board.tsx';
import styles from './practice-session.module.css';

interface PracticeSessionProps {
  language: Language;
  words: Word[];
  onClose: () => void;
}

/** A lesson of about ten questions, full screen. Mount it to start one. */
export function PracticeSession({ language, words, onClose }: PracticeSessionProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [lesson] = useState(() => pickLesson(words));
  // Answers land in the database a moment before the live list catches up, so
  // the freshest copy of each word is kept here too.
  const [answered, setAnswered] = useState<Map<string, Word>>(new Map());
  const [step, setStep] = useState(0);
  const [right, setRight] = useState(0);
  const [confirming, setConfirming] = useState(false);
  // Fewer than the lesson holds when words are archived along the way.
  const [asked, setAsked] = useState(0);

  const latest = (word: Word) => {
    const local = answered.get(word.id);
    return local && local.updatedAt > word.updatedAt ? local : word;
  };
  const current = words.find((word) => word.id === lesson[step]);
  const [exercise, setExercise] = useState<Exercise | null>(() => (current ? buildExercise(current, words, Math.random, canHear(language)) : null));

  // A layout effect, so the dialog is open before the first question takes the
  // focus; opened later, it would hand the focus to the close button.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  // The voice wakes up, or downloads the first time, while the first question is read.
  useEffect(() => void prepareVoice(language), []);

  // The Check button and its verdict stay above the on-screen keyboard.
  useKeyboardFit(ref);

  // The next word's photo is decoded while this question is answered, so it
  // shows on the next question's first frame rather than a moment after.
  const upcoming = words.find((word) => word.id === lesson[step + 1]);
  usePreloadedImage(upcoming ? shownPhoto(latest(upcoming)) : null);

  // Holds the focus, and with it the on-screen keyboard, while one written
  // answer makes way for the next; see `next`.
  const keeper = useRef<HTMLInputElement>(null);

  // Back from the confirmation, the focus returns to the question rather than to
  // whatever opened it, which is often the close button.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirming) focusQuestion(ref.current!);
    wasConfirming.current = confirming;
  }, [confirming]);

  async function answer(correct: boolean): Promise<Word> {
    const updated = await recordAnswer(latest(exercise!.word), correct);
    // The day's first answer, right or wrong, keeps the streak; it is celebrated once the lesson closes.
    markPracticed().catch(() => {});
    setAnswered((map) => new Map(map).set(updated.id, updated));
    setAsked((count) => count + 1);
    if (correct) setRight((count) => count + 1);
    return updated;
  }

  async function archive(archived: boolean): Promise<void> {
    const updated = await setArchived(latest(exercise!.word), archived);
    setAnswered((map) => new Map(map).set(updated.id, updated));
  }

  function next() {
    // Typing one answer and on to the next: the field about to go away hands
    // the focus to the keeper first, so the keyboard does not drop and pop
    // back up when the next question's field takes it. A question with
    // nothing to type then takes the focus off it, and the keyboard goes.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active !== keeper.current && ref.current!.contains(active)) {
      keeper.current!.focus({ preventScroll: true });
    }
    // A word archived mid-lesson is not asked again.
    const fresh = words.map(latest).filter((word) => !word.archived);
    // A word deleted on another device mid-lesson is skipped.
    let index = step + 1;
    while (index < lesson.length && !fresh.some((word) => word.id === lesson[index])) index++;
    const word = fresh.find((candidate) => candidate.id === lesson[index]);
    if (!word) sounds.complete(right === asked);
    setStep(index);
    setExercise(word ? buildExercise(word, fresh, Math.random, canHear(language)) : null);
  }

  const done = !exercise;
  const quit = () => {
    sounds.close();
    onClose();
  };
  // Leaving mid-lesson asks first, so a stray Enter on the close button costs nothing.
  const leave = () => (done ? quit() : setConfirming(true));

  // Escape is handled here rather than by the dialog: after a cancelled Escape,
  // browsers close a dialog on the next one without asking it first.
  const escape = useRef((_event: KeyboardEvent) => {});
  escape.current = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (event.repeat) return;
    if (confirming) setConfirming(false);
    else leave();
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => escape.current(event);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.session}
      aria-label={`${LANGUAGES[language].name} practice`}
      onCancel={(event) => {
        event.preventDefault();
        leave();
      }}
      onClose={() => {
        // Other close requests, like the back gesture, can still shut it unasked:
        // open it again and ask, or the lesson could never be started again.
        const dialog = ref.current!;
        if (dialog.open) return;
        if (done) return quit();
        dialog.showModal();
        setConfirming(true);
      }}
    >
      <header className={styles.top}>
        <button type="button" className={styles.close} onClick={leave} aria-label="End practice">
          <X aria-hidden="true" />
        </button>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={lesson.length}
          aria-valuenow={step}
        >
          <i style={{ width: `${(step / Math.max(1, lesson.length)) * 100}%` }} />
        </div>
        {/* Always there, so the bar keeps its width as the voice comes and goes. */}
        <span className={styles.voiceSlot}>
          <VoiceStatus language={language} />
        </span>
      </header>

      {done ? (
        <Summary right={right} total={asked} onClose={onClose} />
      ) : (
        <Question key={step} language={language} exercise={exercise} onAnswer={answer} onArchive={archive} onNext={next} />
      )}

      {confirming && <ConfirmQuit onStay={() => setConfirming(false)} onQuit={quit} />}
      <input ref={keeper} className={styles.keeper} tabIndex={-1} aria-hidden="true" autoComplete="off" />
    </dialog>
  );
}

/**
 * The voice's first download, which takes a while: a small ring that fills up
 * and leaves once it is done. Words can be practised meanwhile, just not heard.
 * Where the connection asks to save data, it waits for a tap instead.
 */
function VoiceStatus({ language }: { language: Language }) {
  const voice = useVoice(language);
  const name = LANGUAGES[language].name;
  if (voice.status === 'offered') {
    const size = `${Math.round(voice.bytes / 1e6)} MB`;
    return (
      <button
        type="button"
        className={styles.voice}
        onClick={() => downloadVoice(language)}
        aria-label={`Download the ${name} voice, ${size}, to hear the words`}
        title={`Hear the words: download the ${name} voice, ${size}, once`}
      >
        <Download aria-hidden="true" />
      </button>
    );
  }
  if (voice.status !== 'downloading') return null;
  const percent = Math.floor(voice.progress * 100);
  return (
    <span
      className={styles.voice}
      role="progressbar"
      aria-label={`Downloading the ${name} voice`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      title={`Downloading the ${name} voice, ${percent}%. Only this once.`}
    >
      <svg className={styles.voiceRing} viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" pathLength="100" />
        <circle cx="20" cy="20" r="18" pathLength="100" strokeDasharray={`${voice.progress * 100} 100`} />
      </svg>
      <Volume2 aria-hidden="true" />
    </span>
  );
}

/** Puts the focus on the question: its first field, or the form itself, so Enter checks it. */
function focusQuestion(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('form');
  if (!form) return;
  (form.querySelector<HTMLInputElement>('input:not([readonly])') ?? form).focus({ preventScroll: true });
}

/** Asks before abandoning a lesson. Stays is the default, so Enter is safe. */
function ConfirmQuit({ onStay, onQuit }: { onStay: () => void; onQuit: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.confirm}
      data-confirm
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        // Escape closes only this question, not the lesson behind it.
        event.preventDefault();
        event.stopPropagation();
        onStay();
      }}
      onClose={() => {
        if (!ref.current!.open) onStay();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onStay();
      }}
    >
      <h2 id="confirm-title">End this lesson?</h2>
      <p>Your answers so far are kept, but the rest of the lesson is lost.</p>
      <div className={styles.confirmActions}>
        <button type="button" className={`${styles.confirmButton} ${styles.stay}`} onClick={onStay} data-autofocus>
          Keep practicing
        </button>
        <button type="button" className={`${styles.confirmButton} ${styles.leave}`} onClick={onQuit}>
          End lesson
        </button>
      </div>
    </dialog>
  );
}

interface QuestionProps {
  language: Language;
  exercise: Exercise;
  onAnswer: (correct: boolean) => Promise<Word>;
  onArchive: (archived: boolean) => Promise<void>;
  onNext: () => void;
}

interface Result {
  correct: boolean;
  /** Set when the answer moved the word to another level. */
  level: number | null;
  /** Set when the word has been right so often at the top level that it is worth archiving. */
  offer: boolean;
}

/** The keys for the articles, in order: letters when numbers pick an option, numbers otherwise (letters are typed in the word). */
const articleKeys = (answer: Answer) => (answer.kind === 'choice' ? ['a', 's', 'd'] : ['1', '2', '3']);

function Question({ language, exercise, onAnswer, onArchive, onNext }: QuestionProps) {
  const { sex, clue, gender, answer } = exercise;
  const articles = LANGUAGES[language].articles ?? [];
  const [article, setArticle] = useState('');
  const [term, setTerm] = useState('');
  const [slots, setSlots] = useState<Slots>(() => (answer.kind === 'letters' ? emptySlots(answer.tiles) : []));
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const [archived, setArchivedNow] = useState(false);
  const photo = useObjectUrl(clue.kind === 'photo' ? shownPhoto(exercise.word) : null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const termField = useRef<HTMLInputElement>(null);

  const built =
    answer.kind === 'letters'
      ? fillLetters(exercise.term, answer.given, slots.map((index) => (index === null ? '' : answer.tiles[index]!)))
      : term;
  const ready =
    (gender === null || gender === 'shown' || article.trim() !== '') &&
    (answer.kind === 'letters' ? !slots.includes(null) : term.trim() !== '');

  // The verdict hands the focus to Continue, unless an answer is being typed:
  // then it stays in the field, which keeps the keyboard up, and Enter goes on.
  useEffect(() => {
    if (!result) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement && form.current!.contains(active))) nextButton.current?.focus();
  }, [result]);

  const solution = `${exercise.article ? `${exercise.article} ` : ''}${exercise.term}`;
  // The option that answers a choice question, labelled as the options are.
  const expectedOption = gender === 'shown' ? solution : exercise.term;

  // Every word this question can say, made while it is being read, or as soon as the voice is there.
  const voice = useVoice(language).status;
  useEffect(
    () => preloadSpeech(language, answer.kind === 'choice' ? answer.options : clue.kind === 'audio' ? [exercise.term, solution] : [solution]),
    [voice],
  );

  // An audio clue is heard as soon as the question shows, and again on demand.
  // Only the word itself: the article is for the user to give.
  const listen = () => void speak(language, exercise.term);
  useEffect(() => {
    if (clue.kind === 'audio') listen();
  }, []);

  // Letters and writing are said only after a correct answer is confirmed.
  useEffect(() => {
    if (answer.kind !== 'choice' && result?.correct) void speak(language, solution);
  }, [result]);

  // A new question loses the focus of the one before; without a place to land
  // it falls to the first button, the close one, and the next Enter ends the lesson.
  useEffect(() => focusQuestion(form.current!.parentElement!), []);

  async function check(event: FormEvent) {
    event.preventDefault();
    if (result) return onNext();
    if (!ready) return;
    const correct = isCorrect(exercise, article, built);
    try {
      const updated = await onAnswer(correct);
      if (correct) sounds.correct();
      else sounds.wrong();
      if (updated.level > exercise.level) sounds.levelUp();
      setResult({
        correct,
        level: updated.level !== exercise.level ? updated.level : null,
        offer: correct && offersArchive(updated),
      });
    } catch {
      sounds.nudge();
      setFailed(true);
    }
  }

  const locked = result !== null;
  /** Once checked, the right option shows as right, and a wrong pick as wrong. */
  const marked = (picked: boolean, right: boolean) => (!result ? undefined : right ? 'right' : picked ? 'wrong' : undefined);

  async function toggleArchived() {
    try {
      await onArchive(!archived);
      sounds.saved();
      setArchivedNow(!archived);
      setFailed(false);
    } catch {
      sounds.nudge();
      setFailed(true);
    }
  }

  /** An option is said aloud whenever it is picked, right or wrong, so it can be heard before checking. */
  function pickTerm(option: string) {
    if (term !== option) sounds.tap();
    void speak(language, option);
    setTerm(option);
  }

  function pickArticle(option: string) {
    if (article !== option) sounds.tap();
    setArticle(option);
  }

  // Everything has a key: numbers pick an option, A S D (or 1 2 3) an article, and Enter checks or moves on.
  const press = useRef((_event: KeyboardEvent) => {});
  press.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target;
    // The question behind the confirmation must not react to its keys.
    if (target instanceof Element && target.closest('[data-confirm]')) return;
    if (event.key === 'Enter') {
      // Fields submit the form themselves, and the main button is already one.
      if (target instanceof HTMLInputElement || target === nextButton.current) return;
      // The close button and the like keep their own Enter.
      if (target instanceof HTMLButtonElement && !form.current!.contains(target)) return;
      event.preventDefault();
      form.current!.requestSubmit();
      return;
    }
    if (target instanceof HTMLInputElement || locked) return;
    const key = event.key.toLowerCase();
    const keys = articleKeys(answer);
    if (answer.kind === 'choice' && /^[1-9]$/.test(key) && answer.options[Number(key) - 1] !== undefined) {
      event.preventDefault();
      pickTerm(answer.options[Number(key) - 1]!);
    } else if (gender === 'pick' && keys.includes(key) && articles[keys.indexOf(key)] !== undefined) {
      event.preventDefault();
      pickArticle(articles[keys.indexOf(key)]!);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => press.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <form
      ref={form}
      className={styles.question}
      onSubmit={check}
      tabIndex={-1}
      noValidate
      data-split={clue.kind === 'photo' || undefined}
    >
      <div className={styles.body}>
        <p className={styles.prompt}>
          {clue.kind === 'audio'
            ? gender === 'write'
              ? 'Write the word you hear, with its article'
              : 'Write the word you hear'
            : gender === 'pick' || gender === 'write'
              ? 'Which word is it, with its article?'
              : 'Which word is it?'}
        </p>

        <div className={styles.clue}>
          {sex && (
            <span className={styles.sex} data-article={exercise.article ?? undefined}>
              {sex === 'female' ? <Venus aria-hidden="true" /> : <Mars aria-hidden="true" />}
              {sex === 'female' ? 'Female' : 'Male'}
            </span>
          )}
          {clue.kind === 'photo' ? (
            photo && <img src={photo} alt="" decoding="sync" />
          ) : clue.kind === 'audio' ? (
            <button type="button" className={styles.listen} onClick={listen}>
              <Volume2 aria-hidden="true" />
              Listen again
            </button>
          ) : (
            <>
              <span className={styles.clueLabel}>{clue.kind === 'translation' ? 'In English' : 'Meaning'}</span>
              <span className={styles.clueText} lang="en">
                {clue.text}
              </span>
            </>
          )}
        </div>

        <div className={styles.answer}>
          {gender === 'pick' && (
            <div className={styles.articles} role="group" aria-label="Article">
              {articles.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={styles.article}
                  data-article={option}
                  aria-pressed={article === option}
                  data-result={marked(article === option, option === exercise.article)}
                  disabled={locked}
                  onClick={() => pickArticle(option)}
                >
                  {option}
                  {articleKeys(answer)[index] && <kbd className={styles.keyHint}>{articleKeys(answer)[index]}</kbd>}
                </button>
              ))}
            </div>
          )}

          {answer.kind === 'choice' && (
            <div className={styles.options} data-many={answer.options.length > 4 || undefined}>
              {answer.options.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={styles.option}
                  aria-pressed={term === option}
                  data-result={marked(term === option, option === expectedOption)}
                  disabled={locked}
                  lang={language}
                  onClick={() => pickTerm(option)}
                >
                  {option}
                  {index < 9 && <kbd className={styles.keyHint}>{index + 1}</kbd>}
                </button>
              ))}
            </div>
          )}

          {answer.kind === 'letters' && (
            <LetterBoard
              language={language}
              term={exercise.term}
              given={answer.given}
              tiles={answer.tiles}
              slots={slots}
              onChange={setSlots}
              locked={locked}
              wrong={result?.correct === false}
            />
          )}

          {answer.kind === 'write' && (
            <div className={styles.write}>
              {gender === 'write' && (
                <input
                  className={`${styles.field} ${styles.articleField}`}
                  value={article}
                  onChange={(event) => {
                    if (!locked) setArticle(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    // On to the word, rather than checking an answer that has none yet.
                    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (article.trim() !== '') termField.current?.focus();
                  }}
                  placeholder="article"
                  aria-label="Article"
                  enterKeyHint="next"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang={language}
                  // Not read-only once checked: that would drop the keyboard. Typing just does nothing.
                  aria-readonly={locked}
                  data-result={marked(true, sameText(article, exercise.article ?? ''))}
                />
              )}
              <label className={styles.field} data-result={marked(true, sameText(answer.hint + term, exercise.term))}>
                <span className={styles.hint} lang={language}>
                  {answer.hint}
                </span>
                <input
                  ref={termField}
                  value={term}
                  onChange={(event) => {
                    if (!locked) setTerm(event.target.value);
                  }}
                  aria-label={`The word, starting with ${answer.hint}`}
                  aria-readonly={locked}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang={language}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <footer className={styles.foot} data-result={result ? (result.correct ? 'right' : 'wrong') : undefined}>
        {result && (
          <div className={styles.feedback} role="status">
            <span className={styles.mark} aria-hidden="true">
              {result.correct ? <Check /> : <X />}
            </span>
            <span>
              <strong>{result.correct ? 'Right!' : 'Not quite'}</strong>
              {!result.correct && (
                <span lang={language}>
                  It's <b>{solution}</b>
                </span>
              )}
              {result.level !== null && (
                <span>{result.correct ? `Level up: ${result.level}` : `Back to level ${result.level}`}</span>
              )}
              {result.offer && !archived && (
                <span>You've got it right {STREAK_TO_ARCHIVE} times at the top level. Archive it?</span>
              )}
            </span>
            {result.correct && (
              <button
                type="button"
                className={styles.archive}
                data-offered={(result.offer && !archived) || undefined}
                aria-pressed={archived}
                onClick={() => void toggleArchived()}
              >
                <Archive aria-hidden="true" />
                {archived ? 'Archived' : 'Archive'}
              </button>
            )}
          </div>
        )}
        {failed && (
          <p className={styles.error} role="alert">
            This browser would not save it. Try again.
          </p>
        )}
        <button
          ref={nextButton}
          type="submit"
          className={styles.main}
          disabled={!result && !ready}
          // Pressing it while typing leaves the focus, and the keyboard, in the field.
          onMouseDown={(event) => {
            if (document.activeElement instanceof HTMLInputElement) event.preventDefault();
          }}
        >
          {result ? 'Continue' : 'Check'}
        </button>
      </footer>
    </form>
  );
}

function Summary({ right, total, onClose }: { right: number; total: number; onClose: () => void }) {
  return (
    <div className={styles.question}>
      <div className={`${styles.body} ${styles.summary}`}>
        <span className={styles.score}>
          {right}/{total}
        </span>
        <strong>Lesson done</strong>
        <p>{right === total ? 'Every one right.' : 'Misses come back sooner, so they stick.'}</p>
      </div>
      <footer className={styles.foot}>
        <button type="button" className={styles.main} onClick={onClose} autoFocus>
          Done
        </button>
      </footer>
    </div>
  );
}
