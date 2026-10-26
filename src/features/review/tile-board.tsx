import { type MouseEvent, type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { dropLetter } from '../../domain/practice.ts';
import { packTiles, swapTile } from '../../domain/review.ts';
import type { Language } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './review.module.css';

/** Which tile sits in each slot, by its index in `tiles`; null while a slot is empty. */
export type Slots = (number | null)[];

/** A tile's text; a form with nothing in it (a word to take out) reads as such. */
const Face = ({ text }: { text: string }) => (text === '' ? <span className={styles.nothing}>nothing</span> : <>{text}</>);

interface TileBoardProps {
  language: Language;
  tiles: string[];
  slots: Slots;
  onChange: (slots: Slots) => void;
  locked: boolean;
  /**
   * `slide`: a line of tiles, kept in order with no space between them, where
   * one dropped on a placed one goes in front of it and one dropped elsewhere on
   * the line goes at the end. Only the placed tiles show, so the length of the
   * sentence is not given away. `swap`: the gaps of a sentence, where a tile dropped on a taken
   * one trades places with it, so a gap never moves another.
   */
  reorder: 'slide' | 'swap';
  /** Once checked, whether the tile in each slot is right. */
  checked?: boolean[];
  /** Where the slots live. Call `slot(index)` for each one, where it should appear; `count` is how many a line shows. */
  children: (slot: (index: number) => ReactNode, count: number) => ReactNode;
}

interface Drag {
  tile: number;
  /** The slot it was picked up from; null when it came from the bank. */
  from: number | null;
  /** The slot under the finger, if any. */
  over: number | null;
}

/** How far a press has to travel before it counts as a drag, not a tap. */
const DRAG_DISTANCE = 6;

/**
 * Tiles of words to put in slots, with the same feel as the letters of a word:
 * tap one to drop it in the first free slot, tap a placed one to send it back,
 * or drag it. While it hovers over a slot the others make room, and dropping it
 * off the slots takes it out.
 *
 * Every tile stays mounted and is moved with `translate`, so it glides from
 * place to place and the one under the finger keeps its pointer capture. Tiles
 * are as wide as their text, so a slot that holds one, and the bank's place for
 * it, carry an invisible copy of the text to be as wide.
 */
export function TileBoard({ language, tiles, slots, onChange, locked, reorder, checked, children }: TileBoardProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<{ tile: number; from: number | null; x: number; y: number; id: number; lifted?: boolean } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const tileElements = useRef<(HTMLButtonElement | null)[]>([]);

  const place = (from: Slots, tile: number, at: number | null, to: number | null) =>
    reorder === 'swap' ? swapTile(from, tile, at, to) : packTiles(dropLetter(from, tile, at, to));
  // While a tile hovers over a slot, the others already make room for it.
  const shown = drag && drag.over !== null ? place(slots, drag.tile, drag.from, drag.over) : slots;

  const layout = useRef(() => {});
  layout.current = () => {
    const root = board.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const slotElements = new Map<number, HTMLElement>();
    root.querySelectorAll<HTMLElement>('[data-slot]').forEach((element) => slotElements.set(Number(element.dataset.slot), element));
    const homes = root.querySelectorAll<HTMLElement>('[data-home]');
    tiles.forEach((_, tile) => {
      const element = tileElements.current[tile];
      if (!element || drag?.tile === tile) return;
      const at = shown.indexOf(tile);
      const rect = (at >= 0 ? slotElements.get(at) : homes[tile])?.getBoundingClientRect();
      if (rect) element.style.translate = `${rect.left - origin.left}px ${rect.top - origin.top}px`;
    });
  };

  useLayoutEffect(() => layout.current());

  useLayoutEffect(() => {
    const root = board.current!;
    // Tiles only start gliding once they have a place to glide from.
    const frame = requestAnimationFrame(() => root.setAttribute('data-ready', ''));
    const observer = new ResizeObserver(() => layout.current());
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  function tap(tile: number) {
    const at = slots.indexOf(tile);
    const free = slots.indexOf(null);
    if (at >= 0) {
      sounds.lift();
      onChange(place(slots, tile, at, null));
    } else if (free >= 0) {
      sounds.place(free);
      onChange(place(slots, tile, null, free));
    }
  }

  /**
   * Where a tile dropped here goes. Gaps: the nearest one, when close enough to
   * mean it. A line: the tile it is over, to go in front of it, or the end of
   * the line when it is over the line but no tile.
   */
  function slotAt(x: number, y: number): number | null {
    const elements = [...board.current!.querySelectorAll<HTMLElement>('[data-slot]')];
    if (reorder === 'slide') {
      const over = elements.find((element) => {
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });
      if (over) return Number(over.dataset.slot);
      const zone = board.current!.querySelector<HTMLElement>('[data-dropzone]')?.getBoundingClientRect();
      const inside = zone && x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
      return inside ? slots.filter((tile) => tile !== null).length : null;
    }
    let nearest: number | null = null;
    let best = Infinity;
    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (distance < best && distance < rect.height * 1.2) {
        best = distance;
        nearest = Number(element.dataset.slot);
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
    // Dropped off the slots: a placed tile goes back, a loose one stays.
    if (over !== null) sounds.place(over);
    else if (start.from !== null) sounds.lift();
    if (over !== null || start.from !== null) onChange(place(slots, start.tile, start.from, over));
  }

  function cancel() {
    press.current = null;
    setDrag(null);
  }

  // A line shows only what is placed: no empty slots, so its length says nothing of the answer.
  const count = shown.filter((tile) => tile !== null).length;

  const slot = (index: number) => {
    const tile = shown[index];
    return (
      <span key={index} className={styles.slot} data-slot={index} data-filled={tile !== null || undefined} data-over={drag?.over === index || undefined}>
        {tile !== null && tile !== undefined && (
          <span className={styles.ghost} aria-hidden="true">
            <Face text={tiles[tile]!} />
          </span>
        )}
      </span>
    );
  };

  return (
    <div ref={board} className={styles.board} lang={language}>
      {children(slot, count)}
      <div className={styles.bank}>
        {tiles.map((text, tile) => (
          <span key={tile} className={styles.home} data-home="" data-empty={shown.includes(tile) || drag?.tile === tile || undefined}>
            <span className={styles.ghost} aria-hidden="true">
              <Face text={text} />
            </span>
          </span>
        ))}
      </div>
      {tiles.map((text, tile) => {
        const at = shown.indexOf(tile);
        const verdict = checked && at >= 0 ? checked[at] : undefined;
        return (
          <button
            key={tile}
            ref={(element) => {
              tileElements.current[tile] = element;
            }}
            type="button"
            className={styles.tile}
            data-placed={at >= 0 || undefined}
            data-dragging={drag?.tile === tile || undefined}
            data-right={verdict === true || undefined}
            data-wrong={verdict === false || undefined}
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
            <Face text={text} />
          </button>
        );
      })}
    </div>
  );
}
