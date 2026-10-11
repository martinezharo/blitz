import { ArrowDown01, ArrowDown10, ArrowDownAZ, ArrowDownWideNarrow, ArrowUpAZ, ArrowUpNarrowWide, Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import { WORD_SORTS, type WordSort } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './sort-menu.module.css';

const ICONS: Record<WordSort, LucideIcon> = {
  newest: ArrowDownWideNarrow,
  oldest: ArrowUpNarrowWide,
  az: ArrowDownAZ,
  za: ArrowUpAZ,
  levelUp: ArrowDown01,
  levelDown: ArrowDown10,
};

/** Picks how the word list is ordered. A native popover, so outside clicks and Escape close it. */
export function SortMenu({ sort, onChange }: { sort: WordSort; onChange: (sort: WordSort) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = WORD_SORTS.find((option) => option.value === sort)!;
  const CurrentIcon = ICONS[sort];

  return (
    <>
      <button ref={trigger} type="button" className={styles.trigger} popoverTarget={id} aria-label={`Sort words: ${current.label}`}>
        <CurrentIcon aria-hidden="true" />
        {current.label}
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className={styles.menu}
        onToggle={(event) => {
          // Top-layer popovers ignore their parent's position, so pin the menu under the trigger by hand.
          const box = trigger.current?.getBoundingClientRect();
          if (event.nativeEvent instanceof ToggleEvent && event.nativeEvent.newState === 'open' && box) {
            menu.current?.style.setProperty('--top', `${box.bottom + 6}px`);
            menu.current?.style.setProperty('--right', `${document.documentElement.clientWidth - box.right}px`);
          }
        }}
      >
        {WORD_SORTS.map((option) => {
          const Icon = ICONS[option.value];
          return (
            <button
              key={option.value}
              type="button"
              className={styles.option}
              aria-pressed={option.value === sort}
              onClick={() => {
                if (option.value !== sort) sounds.tap();
                onChange(option.value);
                menu.current?.hidePopover();
              }}
            >
              <Icon aria-hidden="true" />
              {option.label}
              {option.value === sort && <Check className={styles.check} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
