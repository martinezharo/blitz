import { type MouseEvent, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dropLetter, tileForTyped } from '../../domain/practice.ts';
import type { Language } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './practice-session.module.css';

/** Which tile sits in each slot of the word, by its index in `tiles`. */
export type Slots = (number | null)[];

export function emptySlots(tiles: string[]): Slots {
  return tiles.map(() => null);
}

interface LetterBoardProps {
  language: Language;
  /** The word, for where its spaces and given letters fall. */
  term: string;
  /** Which characters of the word are already in place. */
  given: boolean[];
  tiles: string[];
  slots: Slots;
  onChange: (slots: Slots) => void;
  locked: boolean;
}

interface Drag {
  tile: number;
  /** The slot it was picked up from; null when it came from the loose letters. */
  from: number | null;
  /** The slot under the finger, if any. */
  over: number | null;
}

/** How far a press has to travel before it counts as a drag, not a tap. */
const DRAG_DISTANCE = 6;

/**
 * Letters to put in order, in the free spots between the ones already given. Tap a letter to drop it in the first free slot, or
 * tap a placed one to send it back. Or drag it: letters in the way slide aside
 * while it hovers, and dropping it off the word takes it out.
 *
 * Every letter stays mounted and is moved with `translate`, so it glides from
 * place to place, and the one under the finger keeps its pointer capture.
 * Pointer events, so fingers and mice behave the same.
 *
 * Or type it on a physical keyboard: each letter key drops the matching loose
 * letter in the first free slot, and Backspace takes the last placed one out.
 * A small note says so, and is hidden on touch screens.
 */
export function LetterBoard({ language, term, given, tiles, slots, onChange, locked }: LetterBoardProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<{ tile: number; from: number | null; x: number; y: number; id: number; lifted?: boolean } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const tileElements = useRef<(HTMLButtonElement | null)[]>([]);

  // While a letter hovers over the word, the others already make room for it.
  const shown = drag && drag.over !== null ? dropLetter(slots, drag.tile, drag.from, drag.over) : slots;
  const layout = useRef(() => {});
  layout.current = () => {
    const root = board.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const slotElements = root.querySelectorAll<HTMLElement>('[data-slot]');
    const homes = root.querySelectorAll<HTMLElement>('[data-home]');
    tiles.forEach((_, tile) => {
      const element = tileElements.current[tile];
      if (!element || drag?.tile === tile) return;
      const at = shown.indexOf(tile);
      const rect = (at >= 0 ? slotElements[at] : homes[tile])!.getBoundingClientRect();
      element.style.translate = `${rect.left - origin.left}px ${rect.top - origin.top}px`;
    });
  };

  useLayoutEffect(() => layout.current());

  useLayoutEffect(() => {
    const root = board.current!;
    // Letters only start gliding once they have a place to glide from.
    const frame = requestAnimationFrame(() => root.setAttribute('data-ready', ''));
    const observer = new ResizeObserver(() => layout.current());
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const typeKey = useRef((_event: KeyboardEvent) => {});
  typeKey.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (event.key === 'Backspace') {
      const last = slots.map((tile) => tile !== null).lastIndexOf(true);
      if (last < 0) return;
      event.preventDefault();
      sounds.lift();
      onChange(dropLetter(slots, slots[last]!, last, null));
      return;
    }
    if (event.repeat || [...event.key].length !== 1) return;
    const free = slots.indexOf(null);
    const tile = free >= 0 ? tileForTyped(tiles, slots, event.key) : null;
    if (tile === null) return;
    event.preventDefault();
    sounds.place(free);
    onChange(dropLetter(slots, tile, null, free));
  };

  useEffect(() => {
    if (locked) return;
    const listener = (event: KeyboardEvent) => typeKey.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [locked]);

  function tap(tile: number) {
    const at = slots.indexOf(tile);
    const free = slots.indexOf(null);
    if (at >= 0) {
      sounds.lift();
      onChange(dropLetter(slots, tile, at, null));
    } else if (free >= 0) {
      sounds.place(free);
      onChange(dropLetter(slots, tile, null, free));
    }
  }

  /** The slot nearest the finger, when it is close enough to mean it. */
  function slotAt(x: number, y: number): number | null {
    let nearest: number | null = null;
    let best = Infinity;
    board.current!.querySelectorAll<HTMLElement>('[data-slot]').forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (distance < best && distance < rect.height * 1.2) {
        best = distance;
        nearest = index;
      }
    });
    return nearest;
  }

  function follow(tile: number, x: number, y: number) {
    const element = tileElements.current[tile]!;
    const origin = board.current!.getBoundingClientRect();
    element.style.translate = `${x - origin.left - element.offsetWidth / 2}px ${y - origin.top - element.offsetHeight / 2}px`;
  }

  function down(event: PointerEvent<HTMLButtonElement>, tile: number) {
    if (locked || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = slots.indexOf(tile);
    press.current = { tile, from: at >= 0 ? at : null, x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = press.current;
    if (!start || start.id !== event.pointerId) return;
    if (!drag && Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_DISTANCE) return;
    const over = slotAt(event.clientX, event.clientY);
    // On the ref, not `drag`: several moves can land before that state does.
    if (!start.lifted) {
      start.lifted = true;
      sounds.tap();
    }
    if (!drag || drag.over !== over) setDrag({ tile: start.tile, from: start.from, over });
    follow(start.tile, event.clientX, event.clientY);
  }

  function up(event: PointerEvent<HTMLButtonElement>) {
    const start = press.current;
    if (!start || start.id !== event.pointerId) return;
    press.current = null;
    // Taps are handled here rather than on click: touch browsers do not
    // always follow a pointer press with a click.
    if (!drag) return tap(start.tile);
    setDrag(null);
    const over = slotAt(event.clientX, event.clientY);
    // Dropped off the word: a placed letter goes back, a loose one stays.
    if (over !== null) sounds.place(over);
    else if (start.from !== null) sounds.lift();
    if (over !== null || start.from !== null) onChange(dropLetter(slots, start.tile, start.from, over));
  }

  function cancel() {
    press.current = null;
    setDrag(null);
  }

  let slot = 0;
  return (
    <div ref={board} className={styles.board} lang={language}>
      <div className={styles.slots} aria-label="Your word">
        {[...term].map((char, index) =>
          /\s/.test(char) ? (
            <span key={index} className={styles.gap} />
          ) : given[index] ? (
            <span key={index} className={styles.slot} data-given="">
              {char}
            </span>
          ) : (
            <span key={index} className={styles.slot} data-slot={slot} data-over={drag?.over === slot++ || undefined} />
          ),
        )}
      </div>
      <div className={styles.tiles}>
        {tiles.map((_, tile) => (
          <span
            key={tile}
            className={styles.home}
            data-home=""
            data-empty={shown.includes(tile) || drag?.tile === tile || undefined}
          />
        ))}
      </div>
      {tiles.map((letter, tile) => (
        <button
          key={tile}
          ref={(element) => {
            tileElements.current[tile] = element;
          }}
          type="button"
          className={styles.tile}
          data-placed={shown.includes(tile) || undefined}
          data-dragging={drag?.tile === tile || undefined}
          disabled={locked}
          onPointerDown={(event) => down(event, tile)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          // Only keyboard presses, which have no pointer events and a zero detail.
          onClick={(event: MouseEvent) => {
            if (event.detail === 0) tap(tile);
          }}
        >
          {letter}
        </button>
      ))}
      <p className={styles.typeHint}>You can also type the letters on your keyboard</p>
    </div>
  );
}
