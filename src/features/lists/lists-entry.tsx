import { ArrowRight, ListPlus } from 'lucide-react';
import { useListIndex } from '../../data/lists.ts';
import styles from './lists-entry.module.css';
import { ListIcon, listTint } from './list-look.tsx';

/** A quiet line under the composer, for when you would rather not type every word. */
export function ListsPill({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={styles.pill} onClick={onOpen}>
      <ListPlus aria-hidden="true" />
      Ready-made word lists
      <ArrowRight className={styles.arrow} aria-hidden="true" />
    </button>
  );
}

/** How many lists the card shows the pictures and names of. */
const SHOWN = 4;

/** The same way in, made bigger for a language with no words yet. */
export function ListsInvite({ onOpen }: { onOpen: () => void }) {
  const { lists } = useListIndex();
  const shown = Array.isArray(lists) ? lists.slice(0, SHOWN) : [];
  // While the lists load, blank chips and a blank line hold their places, so
  // the card does not grow under the finger when they arrive.
  const loading = lists === null;

  return (
    <button type="button" className={styles.invite} onClick={onOpen}>
      {(loading || shown.length > 0) && (
        <span className={styles.chips} aria-hidden="true">
          {loading
            ? Array.from({ length: SHOWN }, (_, index) => <span key={index} className={styles.chip} />)
            : shown.map((list) => (
                <span key={list.id} className={styles.chip} style={listTint(list.tint)}>
                  <ListIcon list={list} />
                </span>
              ))}
        </span>
      )}
      <span className={styles.inviteText}>
        <strong>Start from a list</strong>
        {loading ? <small>&nbsp;</small> : shown.length > 0 && <small>{shown.map((list) => list.name).join(', ')}</small>}
      </span>
      <ArrowRight className={styles.arrow} aria-hidden="true" />
    </button>
  );
}
