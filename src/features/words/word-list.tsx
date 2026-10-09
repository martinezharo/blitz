import { LANGUAGES, type Language, MAX_LEVEL, type Word, wordSummary } from '../../domain/word.ts';
import { morph, morphEndsIn } from '../../shared/ui/morph.ts';
import { openSheetEnds } from '../../shared/ui/sheet.tsx';
import { useObjectUrl } from '../../shared/ui/use-object-url.ts';
import styles from './word-list.module.css';

interface WordListProps {
  language: Language;
  words: Word[];
  onOpen: (word: Word) => void;
}

export function WordList({ language, words, onOpen }: WordListProps) {
  if (words.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyFlag} aria-hidden="true">
          {LANGUAGES[language].flag}
        </span>
        <strong>No {LANGUAGES[language].name} words yet</strong>
        <p>Write your first one up there.</p>
      </div>
    );
  }

  return (
    <>
      <p className={styles.count}>
        {words.length} {words.length === 1 ? 'word' : 'words'}
      </p>
      <ul className={styles.words}>
        {words.map((word) => (
          <li key={word.id}>
            <WordRow word={word} onOpen={(row) => morph(morphEndsIn(row), () => onOpen(word), openSheetEnds)} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The row of the word with this id, which an edited or new word's sheet settles into. */
export function wordRow(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-word-id="${CSS.escape(id)}"]`);
}

function WordRow({ word, onOpen }: { word: Word; onOpen: (row: HTMLElement) => void }) {
  const photo = useObjectUrl(word.photo);
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
