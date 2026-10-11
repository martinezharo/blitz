import { ArrowRight, ListPlus } from 'lucide-react';
import { WORD_LISTS } from '../../domain/lists-catalogue.ts';
import styles from './lists-entry.module.css';
import { LIST_ICONS } from './list-icons.ts';

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

/** The same way in, made bigger for a language with no words yet. */
export function ListsInvite({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={styles.invite} onClick={onOpen}>
      <span className={styles.chips} aria-hidden="true">
        {WORD_LISTS.map((list) => {
          const Icon = LIST_ICONS[list.id];
          return (
            <span key={list.id} className={styles.chip} data-list={list.id}>
              <Icon />
            </span>
          );
        })}
      </span>
      <span className={styles.inviteText}>
        <strong>Start from a list</strong>
        <small>{WORD_LISTS.map((list) => list.name).join(', ')}</small>
      </span>
      <ArrowRight className={styles.arrow} aria-hidden="true" />
    </button>
  );
}
