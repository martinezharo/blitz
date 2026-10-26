import { Archive, Check, X } from 'lucide-react';
import { type FormEvent, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { markPracticed } from '../../data/streak.ts';
import { setCorrectionArchived } from '../../data/writing.ts';
import { buildReview, isRight, pickReview, type Review } from '../../domain/review.ts';
import { LANGUAGES, type Language } from '../../domain/word.ts';
import type { Correction } from '../../domain/writing.ts';
import { sounds } from '../../shared/sound.ts';
import { speak } from '../../shared/speech/speech.ts';
import practice from '../practice/practice-session.module.css';
import styles from './review.module.css';

interface ReviewSessionProps {
  language: Language;
  /** The whole history of the language: the sentences to ask, and a source of extra tiles. */
  corrections: Correction[];
  onClose: () => void;
}

/** A review of about ten sentences from the grammar history, full screen. Mount it to start one. */
export function ReviewSession({ language, corrections, onClose }: ReviewSessionProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reviews] = useState(() => pickReview(corrections).map((correction) => buildReview(correction, corrections)));
  const [step, setStep] = useState(0);
  const [right, setRight] = useState(0);

  // A layout effect, so the dialog is open before the first question takes the focus.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const done = step >= reviews.length;
  const quit = () => {
    sounds.close();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className={practice.session}
      aria-label={`${LANGUAGES[language].name} grammar review`}
      onCancel={(event) => {
        event.preventDefault();
        quit();
      }}
      onClose={() => {
        // Closed by other means, like the back gesture: nothing is lost, so leave.
        if (!ref.current!.open) onClose();
      }}
    >
      <header className={practice.top}>
        <button type="button" className={practice.close} onClick={quit} aria-label="End review">
          <X aria-hidden="true" />
        </button>
        <div className={practice.progress} role="progressbar" aria-valuemin={0} aria-valuemax={reviews.length} aria-valuenow={step}>
          <i style={{ width: `${(step / Math.max(1, reviews.length)) * 100}%` }} />
        </div>
      </header>

      {done ? (
        <Summary right={right} total={reviews.length} onClose={quit} />
      ) : (
        <Question
          key={step}
          language={language}
          review={reviews[step]!}
          onAnswer={(correct) => {
            // As with words, the day's first answer, right or wrong, keeps the streak.
            markPracticed().catch(() => {});
            if (correct) setRight((count) => count + 1);
          }}
          onNext={() => {
            if (step + 1 >= reviews.length) sounds.complete(right === reviews.length);
            setStep(step + 1);
          }}
        />
      )}
    </dialog>
  );
}

interface QuestionProps {
  language: Language;
  review: Review;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}

/** A tile's text; a form with nothing in it (a word to take out) reads as such. */
const Face = ({ text }: { text: string }) => (text === '' ? <span className={styles.nothing}>nothing</span> : <>{text}</>);

function Question({ language, review, onAnswer, onNext }: QuestionProps) {
  const { correction } = review;
  // Tiles in the order they were placed. For a sentence, only the ones placed;
  // for gaps, one entry per gap, empty until filled.
  const [placed, setPlaced] = useState<(number | null)[]>(() => (review.kind === 'gaps' ? review.answers.map(() => null) : []));
  const [result, setResult] = useState<boolean | null>(null);
  const [archived, setArchived] = useState(false);
  const [failed, setFailed] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  const locked = result !== null;
  const ready = review.kind === 'gaps' ? !placed.includes(null) : placed.length > 0;
  const attempt = placed.map((tile) => (tile === null ? null : review.tiles[tile]!));

  useEffect(() => form.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (locked) next.current?.focus();
  }, [locked]);

  function pick(tile: number) {
    if (locked || placed.includes(tile)) return;
    if (review.kind === 'tiles') {
      sounds.place(placed.length);
      setPlaced([...placed, tile]);
      return;
    }
    const free = placed.indexOf(null);
    if (free < 0) return;
    sounds.place(free);
    setPlaced(placed.map((current, at) => (at === free ? tile : current)));
  }

  function lift(at: number) {
    if (locked || placed[at] === null) return;
    sounds.lift();
    setPlaced(review.kind === 'tiles' ? placed.filter((_, index) => index !== at) : placed.map((current, index) => (index === at ? null : current)));
  }

  function check(event: FormEvent) {
    event.preventDefault();
    if (locked) return onNext();
    if (!ready) return;
    const correct = isRight(review, attempt);
    onAnswer(correct);
    setResult(correct);
    if (correct) {
      sounds.correct();
      void speak(language, correction.corrected);
    } else {
      sounds.wrong();
    }
  }

  async function toggleArchived() {
    try {
      await setCorrectionArchived(correction.id, !archived);
      sounds.saved();
      setArchived(!archived);
      setFailed(false);
    } catch {
      sounds.nudge();
      setFailed(true);
    }
  }

  return (
    <form
      ref={form}
      className={practice.question}
      onSubmit={check}
      onKeyDown={(event) => {
        // The form itself has the focus between taps: Enter checks, as in a lesson of words.
        if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
        event.preventDefault();
        event.currentTarget.requestSubmit();
      }}
      tabIndex={-1}
      noValidate
    >
      <div className={practice.body}>
        <p className={practice.prompt}>{review.kind === 'tiles' ? 'Build the sentence' : 'Fill in the gaps'}</p>

        {review.kind === 'tiles' ? (
          <>
            <div className={practice.clue}>
              <span className={practice.clueLabel}>In English</span>
              <span className={practice.clueText} lang="en">
                {review.meaning}
              </span>
            </div>
            <div className={styles.line} lang={language} aria-label="Your sentence">
              {placed.map((tile, at) => (
                <button key={tile} type="button" className={styles.chip} disabled={locked} onClick={() => lift(at)}>
                  {review.tiles[tile!]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.sentence} lang={language}>
            {review.parts.map((part, at) =>
              typeof part === 'string' ? (
                <Fragment key={at}>{part}</Fragment>
              ) : (
                <button
                  key={at}
                  type="button"
                  className={styles.gap}
                  data-filled={placed[part.gap] !== null || undefined}
                  data-right={(locked && attempt[part.gap] === review.answers[part.gap]) || undefined}
                  data-wrong={(locked && attempt[part.gap] !== review.answers[part.gap]) || undefined}
                  disabled={locked}
                  aria-label={`Gap ${part.gap + 1}`}
                  onClick={() => lift(part.gap)}
                >
                  {attempt[part.gap] === null || attempt[part.gap] === undefined ? ' ' : <Face text={attempt[part.gap]!} />}
                </button>
              ),
            )}
          </p>
        )}

        <div className={styles.bank} lang={language}>
          {review.tiles.map((text, tile) => (
            <button
              key={tile}
              type="button"
              className={styles.chip}
              data-used={placed.includes(tile) || undefined}
              disabled={locked || placed.includes(tile)}
              onClick={() => pick(tile)}
            >
              <Face text={text} />
            </button>
          ))}
        </div>
      </div>

      <footer className={practice.foot} data-result={result === null ? undefined : result ? 'right' : 'wrong'}>
        {result !== null && (
          <div className={practice.feedback} role="status">
            <span className={practice.mark} aria-hidden="true">
              {result ? <Check /> : <X />}
            </span>
            <span>
              <strong>{result ? 'Right!' : 'Not quite'}</strong>
              {!result && (
                <span lang={language}>
                  It's <b>{correction.corrected}</b>
                </span>
              )}
              {correction.fixes.map((fix, at) => (
                <span key={at} className={styles.why}>
                  <b lang={language}>
                    {fix.wrong} → {fix.right || 'nothing'}
                  </b>
                  {fix.why && `: ${fix.why}`}
                </span>
              ))}
            </span>
            {result && (
              <button
                type="button"
                className={practice.archive}
                aria-pressed={archived}
                title="Take this sentence out of the review. It stays in the history."
                onClick={() => void toggleArchived()}
              >
                <Archive aria-hidden="true" />
                {archived ? 'Archived' : 'I know it'}
              </button>
            )}
          </div>
        )}
        {failed && (
          <p className={practice.error} role="alert">
            This browser would not save it. Try again.
          </p>
        )}
        <button ref={next} type="submit" className={practice.main} disabled={!locked && !ready}>
          {locked ? 'Continue' : 'Check'}
        </button>
      </footer>
    </form>
  );
}

function Summary({ right, total, onClose }: { right: number; total: number; onClose: () => void }) {
  return (
    <div className={practice.question}>
      <div className={`${practice.body} ${practice.summary}`}>
        <span className={practice.score}>
          {right}/{total}
        </span>
        <strong>Review done</strong>
        <p>{right === total ? 'Every one right.' : 'Keep the ones you still miss; archive the ones you know.'}</p>
      </div>
      <footer className={practice.foot}>
        <button type="button" className={practice.main} onClick={onClose} autoFocus>
          Done
        </button>
      </footer>
    </div>
  );
}
