import { Check, ChevronLeft, LoaderCircle, Plus, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addWords } from '../../data/words.ts';
import { fillDraft, type Suggestion } from '../../domain/dictionary.ts';
import { knownWords, type WordList } from '../../domain/lists.ts';
import { WORD_LISTS } from '../../domain/lists-catalogue.ts';
import { emptyDraft, LANGUAGES, type Language, type Word, wordSummary } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import { listIcon, listTint } from './list-looks.ts';
import styles from './lists-page.module.css';

interface ListsPageProps {
  language: Language;
  /** Everything saved in the language, archived or not, so no word is added twice. */
  words: Word[];
  onClose: () => void;
}

/** The ready-made lists, full screen: pick a list, untick what you do not want, add the rest. */
export function ListsPage({ language, words, onClose }: ListsPageProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<WordList | null>(null);
  const spec = LANGUAGES[language];

  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const quit = () => {
    sounds.close();
    onClose();
  };
  const back = () => {
    sounds.close();
    setOpen(null);
  };
  const leave = () => (open ? back() : quit());

  // Escape is handled here rather than by the dialog, as in a lesson: after a
  // cancelled Escape, browsers close a dialog on the next one without asking.
  const escape = useRef((_event: KeyboardEvent) => {});
  escape.current = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (!event.repeat) leave();
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => escape.current(event);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.page}
      aria-label={`${spec.name} word lists`}
      onCancel={(event) => {
        event.preventDefault();
        leave();
      }}
      // Other close requests, like the back gesture, shut it for good. A close
      // that has already been undone, by a remount, is not one.
      onClose={() => {
        if (!ref.current!.open) onClose();
      }}
    >
      <header className={styles.top}>
        <button
          type="button"
          className={styles.close}
          onClick={leave}
          aria-label={open ? 'Back to the lists' : 'Close the lists'}
        >
          {open ? <ChevronLeft aria-hidden="true" /> : <X aria-hidden="true" />}
        </button>
        <span className={styles.language}>
          <span aria-hidden="true">{spec.flag}</span>
          {spec.name}
        </span>
      </header>

      {open ? (
        <ListDetail
          // Fresh ticks for each list.
          key={open.id}
          list={open}
          language={language}
          words={words}
          onDone={onClose}
        />
      ) : (
        <ListGrid
          language={language}
          words={words}
          onOpen={(list) => {
            sounds.open();
            setOpen(list);
          }}
        />
      )}
    </dialog>
  );
}

function ListGrid({ language, words, onOpen }: { language: Language; words: Word[]; onOpen: (list: WordList) => void }) {
  return (
    <div className={styles.body}>
      <div className={styles.column}>
        <h2 className={styles.title}>Word lists</h2>
        <p className={styles.lede}>Pick a list, untick what you do not want, and add the rest.</p>
        <ul className={styles.grid}>
          {WORD_LISTS.map((list) => {
            const Icon = listIcon(list.id);
            const items = list.words[language];
            const have = knownWords(items, words).size;
            const all = have === items.length;
            return (
              <li key={list.id}>
                <button type="button" className={styles.card} style={listTint(list.id)} onClick={() => onOpen(list)}>
                  <span className={styles.icon} aria-hidden="true">
                    <Icon />
                  </span>
                  <strong>{list.name}</strong>
                  <span className={styles.sample} lang={language}>
                    {items
                      .slice(0, 3)
                      .map((item) => item.term)
                      .join(', ')}
                    …
                  </span>
                  <span className={styles.count} data-done={all || undefined}>
                    {all ? (
                      <>
                        <Check aria-hidden="true" />
                        All added
                      </>
                    ) : have > 0 ? (
                      `${have} of ${items.length} added`
                    ) : (
                      `${items.length} words`
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ListDetail({
  list,
  language,
  words,
  onDone,
}: {
  list: WordList;
  language: Language;
  words: Word[];
  onDone: () => void;
}) {
  const items = list.words[language];
  const Icon = listIcon(list.id);
  // Taken when the list opens: words added from it do not turn into "known"
  // under the person's fingers.
  const [known] = useState(() => knownWords(items, words));
  const available = items.filter((item) => !known.has(item));
  const [picked, setPicked] = useState<Set<Suggestion>>(() => new Set(available));
  const [adding, setAdding] = useState(false);
  const everyOne = picked.size === available.length;

  function toggle(item: Suggestion) {
    sounds.toggle(!picked.has(item));
    const next = new Set(picked);
    if (!next.delete(item)) next.add(item);
    setPicked(next);
  }

  async function add() {
    if (adding) return;
    if (picked.size === 0) return sounds.nudge();
    setAdding(true);
    try {
      // In the list's own order, whatever the order of the ticks.
      await addWords(
        language,
        items.filter((item) => picked.has(item)).map((item) => fillDraft(language, emptyDraft(item.term), item)),
      );
      sounds.saved();
      onDone();
    } catch {
      sounds.nudge();
      setAdding(false);
    }
  }

  return (
    <>
      <div className={styles.body}>
        <div className={styles.column}>
          <div className={styles.detailHead} style={listTint(list.id)}>
            <span className={styles.icon} aria-hidden="true">
              <Icon />
            </span>
            <div>
              <h2 className={styles.title}>{list.name}</h2>
              <p className={styles.lede}>
                {items.length} words
                {known.size > 0 && ` · ${known.size} already in your list`}
              </p>
            </div>
          </div>

          {available.length > 0 && (
            <div className={styles.toolbar}>
              <span>
                {picked.size} of {available.length} selected
              </span>
              <button
                type="button"
                onClick={() => {
                  sounds.toggle(!everyOne);
                  setPicked(everyOne ? new Set() : new Set(available));
                }}
              >
                {everyOne ? 'Select none' : 'Select all'}
              </button>
            </div>
          )}

          <ul className={styles.rows}>
            {items.map((item) => {
              const have = known.has(item);
              return (
                <li key={`${item.article ?? ''} ${item.term}`}>
                  <label className={styles.row} data-article={item.article} data-known={have || undefined}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={picked.has(item)}
                      disabled={have || adding}
                      onChange={() => toggle(item)}
                    />
                    <span className={styles.box} aria-hidden="true">
                      <Check />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.term} lang={language}>
                        {item.article && <span className={styles.article}>{item.article} </span>}
                        {item.term}
                      </span>
                      <span className={styles.summary}>{wordSummary(item)}</span>
                    </span>
                    {have && <span className={styles.have}>In your list</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className={styles.dock}>
        <button type="button" className={styles.cta} aria-disabled={picked.size === 0 || adding} onClick={add}>
          <span className={styles.ctaText}>
            <strong>{picked.size === 0 ? 'Nothing selected' : `Add ${picked.size} ${picked.size === 1 ? 'word' : 'words'}`}</strong>
            <small>to your {LANGUAGES[language].name} words</small>
          </span>
          <span className={styles.go} aria-hidden="true">
            {adding ? <LoaderCircle className={styles.spin} /> : <Plus />}
          </span>
        </button>
      </div>
    </>
  );
}
