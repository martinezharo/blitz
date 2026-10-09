import { flushSync } from 'react-dom';

/** The two things that travel: the container, and the word written in it. */
export interface MorphEnds {
  box: HTMLElement;
  term?: HTMLElement | null;
}

const BOX = 'morph-box';
const TERM = 'morph-term';

function name(ends: MorphEnds, on: boolean) {
  ends.box.style.viewTransitionName = on ? BOX : '';
  if (ends.term) ends.term.style.viewTransitionName = on ? TERM : '';
}

/**
 * Turns `from` into whatever `to` finds once `update` has rendered, with a
 * shared-element view transition: the box grows or shrinks into its new place
 * and the word flies across with it. Without view transitions, or when the
 * person asked for less motion, it just runs `update`.
 *
 * `update` may set React state; it is flushed before `to` looks for the target.
 */
export function morph(
  from: MorphEnds | null,
  update: () => void,
  to: () => MorphEnds | null | Promise<MorphEnds | null>,
): void {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }

  const root = document.documentElement;
  let target: MorphEnds | null = null;
  root.dataset.morph = '';
  if (from) name(from, true);

  const transition = document.startViewTransition(async () => {
    if (from) name(from, false);
    flushSync(update);
    target = await to();
    if (target) {
      name(target, true);
      // Its own entrance animation would fight the morph.
      target.box.dataset.morphed = '';
    }
  });

  transition.finished
    .catch(() => {})
    .finally(() => {
      if (target) name(target, false);
      delete root.dataset.morph;
    });
}

/** The ends inside an element marked up for morphing, if it is on screen. */
export function morphEndsIn(box: HTMLElement | null): MorphEnds | null {
  if (!box) return null;
  const { top, bottom } = box.getBoundingClientRect();
  if (bottom < 0 || top > window.innerHeight) return null;
  return { box, term: box.querySelector<HTMLElement>('[data-morph-term]') };
}

/** Looks for an element a few times while a store catches up, then gives up. */
export async function waitFor<T>(find: () => T | null, tries = 20): Promise<T | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  return null;
}
