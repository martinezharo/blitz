import { LANGUAGES, type Language, MAX_LEVEL, type Word, wordSummary } from '../../domain/word.ts';
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
            <WordRow word={word} onOpen={() => onOpen(word)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function WordRow({ word, onOpen }: { word: Word; onOpen: () => void }) {
  const photo = useObjectUrl(word.photo);
  const summary = wordSummary(word);

  return (
    <button type="button" className={styles.word} onClick={onOpen}>
      <span className={styles.thumb} data-article={word.article ?? undefined} aria-hidden="true">
        {photo ? <img src={photo} alt="" /> : word.term.charAt(0).toUpperCase()}
      </span>
      <span className={styles.text}>
        <span className={styles.term} lang={word.language}>
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
