import { Check, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { recordAnswer } from '../../data/words.ts';
import { buildExercise, type Exercise, fillLetters, isCorrect, pickLesson } from '../../domain/practice.ts';
import { LANGUAGES, type Language, type Word } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import { useObjectUrl } from '../../shared/ui/use-object-url.ts';
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

  const latest = (word: Word) => {
    const local = answered.get(word.id);
    return local && local.updatedAt > word.updatedAt ? local : word;
  };
  const current = words.find((word) => word.id === lesson[step]);
  const [exercise, setExercise] = useState<Exercise | null>(() => (current ? buildExercise(current, words) : null));

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function answer(correct: boolean): Promise<Word> {
    const updated = await recordAnswer(latest(exercise!.word), correct);
    setAnswered((map) => new Map(map).set(updated.id, updated));
    if (correct) setRight((count) => count + 1);
    return updated;
  }

  function next() {
    const fresh = words.map(latest);
    // A word deleted on another device mid-lesson is skipped.
    let index = step + 1;
    while (index < lesson.length && !fresh.some((word) => word.id === lesson[index])) index++;
    const word = fresh.find((candidate) => candidate.id === lesson[index]);
    if (!word) sounds.complete(right === lesson.length);
    setStep(index);
    setExercise(word ? buildExercise(word, fresh) : null);
  }

  const done = !exercise;
  const quit = () => {
    sounds.close();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className={styles.session}
      aria-label={`${LANGUAGES[language].name} practice`}
      onCancel={(event) => {
        event.preventDefault();
        quit();
      }}
    >
      <header className={styles.top}>
        <button type="button" className={styles.close} onClick={quit} aria-label="End practice">
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
      </header>

      {done ? (
        <Summary right={right} total={lesson.length} onClose={onClose} />
      ) : (
        <Question key={step} language={language} exercise={exercise} onAnswer={answer} onNext={next} />
      )}
    </dialog>
  );
}

interface QuestionProps {
  language: Language;
  exercise: Exercise;
  onAnswer: (correct: boolean) => Promise<Word>;
  onNext: () => void;
}

interface Result {
  correct: boolean;
  /** Set when the answer moved the word to another level. */
  level: number | null;
}

function Question({ language, exercise, onAnswer, onNext }: QuestionProps) {
  const { word, clue, gender, answer } = exercise;
  const articles = LANGUAGES[language].articles ?? [];
  const [article, setArticle] = useState('');
  const [term, setTerm] = useState('');
  const [slots, setSlots] = useState<Slots>(() => (answer.kind === 'letters' ? emptySlots(answer.tiles) : []));
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const photo = useObjectUrl(clue.kind === 'photo' ? clue.photo : null);
  const nextButton = useRef<HTMLButtonElement>(null);

  const built =
    answer.kind === 'letters'
      ? fillLetters(word.term, answer.given, slots.map((index) => (index === null ? '' : answer.tiles[index]!)))
      : term;
  const ready =
    (gender === null || gender === 'shown' || article.trim() !== '') &&
    (answer.kind === 'letters' ? !slots.includes(null) : term.trim() !== '');

  useEffect(() => {
    if (result) nextButton.current?.focus();
  }, [result]);

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
      setResult({ correct, level: updated.level !== exercise.level ? updated.level : null });
    } catch {
      sounds.nudge();
      setFailed(true);
    }
  }

  const solution = `${word.article ? `${word.article} ` : ''}${word.term}`;
  const locked = result !== null;

  return (
    <form className={styles.question} onSubmit={check} noValidate>
      <div className={styles.body}>
        <p className={styles.prompt}>
          {gender === 'pick' || gender === 'write' ? 'Which word is it, with its article?' : 'Which word is it?'}
        </p>

        <div className={styles.clue}>
          {clue.kind === 'photo' ? (
            photo && <img src={photo} alt="" />
          ) : (
            <>
              <span className={styles.clueLabel}>{clue.kind === 'translation' ? 'In English' : 'Meaning'}</span>
              <span className={styles.clueText} lang="en">
                {clue.text}
              </span>
            </>
          )}
        </div>

        {gender === 'pick' && (
          <div className={styles.articles} role="group" aria-label="Article">
            {articles.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.article}
                data-article={option}
                aria-pressed={article === option}
                disabled={locked}
                onClick={() => {
                  if (article !== option) sounds.tap();
                  setArticle(option);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {answer.kind === 'choice' && (
          <div className={styles.options} data-many={answer.options.length > 4 || undefined}>
            {answer.options.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.option}
                aria-pressed={term === option}
                disabled={locked}
                lang={language}
                onClick={() => {
                  if (term !== option) sounds.tap();
                  setTerm(option);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {answer.kind === 'letters' && (
          <LetterBoard
            language={language}
            term={word.term}
            given={answer.given}
            tiles={answer.tiles}
            slots={slots}
            onChange={setSlots}
            locked={locked}
          />
        )}

        {answer.kind === 'write' && (
          <div className={styles.write}>
            {gender === 'write' && (
              <input
                className={`${styles.field} ${styles.articleField}`}
                value={article}
                onChange={(event) => setArticle(event.target.value)}
                placeholder="article"
                aria-label="Article"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                lang={language}
                readOnly={locked}
                autoFocus
              />
            )}
            <label className={styles.field}>
              <span className={styles.hint} lang={language}>
                {answer.hint}
              </span>
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                aria-label={`The word, starting with ${answer.hint}`}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                lang={language}
                readOnly={locked}
                autoFocus={gender !== 'write'}
              />
            </label>
          </div>
        )}
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
            </span>
          </div>
        )}
        {failed && (
          <p className={styles.error} role="alert">
            This browser would not save it. Try again.
          </p>
        )}
        <button ref={nextButton} type="submit" className={styles.main} disabled={!result && !ready}>
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
