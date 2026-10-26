import { Archive, ArchiveRestore, Dumbbell, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { deleteCorrection, setCorrectionArchived, translateMissing, useCorrections } from '../../data/writing.ts';
import { reviewable } from '../../domain/review.ts';
import type { Language } from '../../domain/word.ts';
import type { Correction } from '../../domain/writing.ts';
import { sounds } from '../../shared/sound.ts';
import { ReviewSession } from '../review/review-session.tsx';
import styles from './writing.module.css';

/** Sentences shown before "Show all". */
const FIRST = 5;

const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** The sentences written with a grammar mistake, newest first: as written, and as they should be. */
export function History({ language }: { language: Language }) {
  const corrections = useCorrections(language);
  const [all, setAll] = useState(false);
  const [learned, setLearned] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  // German sentences get their English meaning, to be asked from it. Quietly, and only what is missing.
  useEffect(() => void translateMissing(language), [language]);

  if (!corrections || corrections.length === 0) return null;
  const active = corrections.filter((correction) => !correction.archived);
  const archived = corrections.filter((correction) => correction.archived);
  const shown = all ? active : active.slice(0, FIRST);
  const toReview = reviewable(corrections).length;

  return (
    <section className={styles.history} aria-labelledby="grammar-history">
      <h2 id="grammar-history" className={styles.historyTitle}>
        Grammar history
        <span className={styles.historyCount}>{active.length}</span>
      </h2>
      <p className={styles.lede}>Your sentences with a grammar mistake, and how they should be.</p>
      {toReview > 0 && (
        <button
          type="button"
          className={styles.review}
          onClick={() => {
            sounds.open();
            setReviewing(true);
          }}
        >
          <Dumbbell aria-hidden="true" />
          Review these mistakes
        </button>
      )}
      <ol className={styles.entries}>
        {shown.map((correction) => (
          <Entry key={correction.id} correction={correction} language={language} />
        ))}
      </ol>
      {active.length > FIRST && (
        <button
          type="button"
          className={`${styles.quiet} ${styles.more}`}
          onClick={() => {
            sounds.tap();
            setAll(!all);
          }}
        >
          {all ? 'Show fewer' : `Show all ${active.length}`}
        </button>
      )}
      {archived.length > 0 && (
        <>
          <button
            type="button"
            className={`${styles.quiet} ${styles.more}`}
            aria-expanded={learned}
            onClick={() => {
              sounds.tap();
              setLearned(!learned);
            }}
          >
            {learned ? 'Hide learned' : `Learned (${archived.length})`}
          </button>
          {learned && (
            <ol className={styles.entries}>
              {archived.map((correction) => (
                <Entry key={correction.id} correction={correction} language={language} />
              ))}
            </ol>
          )}
        </>
      )}
      {reviewing && <ReviewSession language={language} corrections={corrections} onClose={() => setReviewing(false)} />}
    </section>
  );
}

/** A sentence with some of its pieces marked: `[start, end]` spans, in order. */
function Marked({ text, spans, className }: { text: string; spans: [number, number][]; className: string | undefined }) {
  const parts: ReactNode[] = [];
  let at = 0;
  spans.forEach(([start, end], index) => {
    if (start < at) return;
    parts.push(text.slice(at, start));
    parts.push(
      <mark key={index} className={className}>
        {text.slice(start, end) || ' '}
      </mark>,
    );
    at = end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function Entry({ correction, language }: { correction: Correction; language: Language }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={styles.entry}>
      <p className={styles.written} lang={language}>
        <Marked text={correction.written} spans={correction.fixes.map((fix) => fix.from)} className={styles.was} />
      </p>
      <p className={styles.corrected} lang={language}>
        <Marked text={correction.corrected} spans={correction.fixes.map((fix) => fix.to)} className={styles.now} />
      </p>
      {correction.translation && (
        <p className={styles.meaning} lang="en">
          {correction.translation}
        </p>
      )}
      <ul className={styles.whys}>
        {correction.fixes.map((fix, index) => (
          <li key={index}>
            <strong lang={language}>
              {fix.wrong} → {fix.right}
            </strong>
            {fix.why && <span>{fix.why}</span>}
          </li>
        ))}
      </ul>
      <footer className={styles.entryFoot}>
        <time dateTime={new Date(correction.createdAt).toISOString()}>{DAY.format(correction.createdAt)}</time>
        <button
          type="button"
          className={styles.keep}
          onClick={() => {
            sounds.saved();
            void setCorrectionArchived(correction.id, !correction.archived);
          }}
          aria-label={correction.archived ? 'Bring it back into the review' : 'Mark it as learned'}
          title={correction.archived ? 'Bring it back into the review' : 'Learned: take it out of the review'}
        >
          {correction.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {correction.archived ? 'Restore' : 'Learned'}
        </button>
        <button
          type="button"
          className={styles.forget}
          data-confirming={confirming || undefined}
          onBlur={() => setConfirming(false)}
          onClick={() => {
            if (!confirming) {
              sounds.armed();
              setConfirming(true);
              return;
            }
            sounds.deleted();
            void deleteCorrection(correction.id);
          }}
          aria-label={confirming ? 'Remove it from the history' : 'Remove'}
        >
          <Trash2 aria-hidden="true" />
          {confirming && 'Remove'}
        </button>
      </footer>
    </li>
  );
}
