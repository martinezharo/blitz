import { Archive, ChevronDown } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { mastery } from '../../domain/practice.ts';
import { LANGUAGES, type Language, MAX_LEVEL, sortWords, type Word, type WordSort, wordSummary } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import { morph, morphEndsIn } from '../../shared/ui/morph.ts';
import { openSheetEnds } from '../../shared/ui/sheet.tsx';
import { shownPhoto } from '../../data/shown-photo.ts';
import { useObjectUrl } from '../../shared/ui/use-object-url.ts';
import { ListsInvite } from '../lists/lists-entry.tsx';
import { SortMenu } from './sort-menu.tsx';
import styles from './word-list.module.css';

interface WordListProps {
  language: Language;
  words: Word[];
  sort: WordSort;
  onSortChange: (sort: WordSort) => void;
  onOpen: (word: Word) => void;
  onBrowseLists: () => void;
}

/** Every word of the language: the ones in practice first, the archived ones in a drawer below. */
export function WordList({ language, words, sort, onSortChange, onOpen, onBrowseLists }: WordListProps) {
  const [showArchived, setShowArchived] = useState(false);
  const sorted = useMemo(() => sortWords(words, sort, language), [words, sort, language]);

  if (words.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyFlag} aria-hidden="true">
          {LANGUAGES[language].flag}
        </span>
        <strong>No {LANGUAGES[language].name} words yet</strong>
        <p>Write your first one up there.</p>
        <ListsInvite onOpen={onBrowseLists} />
      </div>
    );
  }

  const { points, max } = mastery(words);
  const active = sorted.filter((word) => !word.archived);
  const archived = sorted.filter((word) => word.archived);
  const open = (word: Word, row: HTMLElement) => {
    sounds.open();
    morph(morphEndsIn(row), () => onOpen(word), openSheetEnds);
  };

  return (
    <>
      <div className={styles.count}>
        <span className={styles.mastery} role="img" aria-label={`Mastery ${points} of ${max} points`}>
          <span className={styles.meter} style={{ '--fill': points / max } as CSSProperties} />
          {points} / {max}
        </span>
        <span>
          {active.length} {active.length === 1 ? 'word' : 'words'}
        </span>
        <SortMenu sort={sort} onChange={onSortChange} />
      </div>
      {active.length > 0 ? (
        <ul className={styles.words}>
          {active.map((word) => (
            <li key={word.id}>
              <WordRow word={word} onOpen={(row) => open(word, row)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.allArchived}>Every word is archived. Add a new one to practise again.</p>
      )}

      {archived.length > 0 && (
        <section className={styles.archive}>
          <button
            type="button"
            className={styles.archiveToggle}
            aria-expanded={showArchived}
            onClick={() => {
              sounds.toggle(!showArchived);
              setShowArchived(!showArchived);
            }}
          >
            <Archive aria-hidden="true" />
            Archived
            <span className={styles.archiveCount}>{archived.length}</span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </button>
          {showArchived && (
            <ul className={`${styles.words} ${styles.archived}`}>
              {archived.map((word) => (
                <li key={word.id}>
                  <WordRow word={word} onOpen={(row) => open(word, row)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

/** The row of the word with this id, which an edited or new word's sheet settles into. */
export function wordRow(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-word-id="${CSS.escape(id)}"]`);
}

function WordRow({ word, onOpen }: { word: Word; onOpen: (row: HTMLElement) => void }) {
  const photo = useObjectUrl(shownPhoto(word));
  const summary = wordSummary(word);

  return (
    <button type="button" className={styles.word} data-word-id={word.id} onClick={(event) => onOpen(event.currentTarget)}>
      <span className={styles.thumb} data-article={word.article ?? undefined} aria-hidden="true">
        {photo ? <img src={photo} alt="" /> : word.term.charAt(0).toUpperCase()}
      </span>
      <span className={styles.text}>
        <span className={styles.term} lang={word.language} data-morph-term>
          {word.article && (
            <span className={styles.article} data-article={word.article}>
              {word.article}{' '}
            </span>
          )}
          {word.term}
          <span className={styles.type}>{word.type}</span>
        </span>
        {summary && <span className={styles.summary}>{summary}</span>}
      </span>
      <span className={styles.level} role="img" aria-label={`Level ${word.level} of ${MAX_LEVEL}`}>
        {Array.from({ length: MAX_LEVEL }, (_, step) => (
          <i key={step} data-on={step < word.level || undefined} />
        ))}
      </span>
    </button>
  );
}
