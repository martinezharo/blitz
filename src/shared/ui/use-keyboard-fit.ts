import { type RefObject, useLayoutEffect } from 'react';

/**
 * Fits a full-screen element to the part of the screen the on-screen keyboard
 * leaves free, so what sits at its bottom (a lesson's Check button and its
 * verdict) rides just above the keyboard instead of hiding behind it.
 *
 * Phones only shrink the visual viewport for the keyboard: Android's Chrome
 * by default, and Safari always. So the element follows `visualViewport`,
 * through `--keyboard-top` and `--keyboard-height`, and gets `data-keyboard`
 * while the keyboard is up. A pinch zoom shrinks the visual viewport too, but
 * that is not a keyboard, so a zoomed page is left as it is.
 */
export function useKeyboardFit(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const element = ref.current;
    if (!viewport || !element) return;
    const fit = () => {
      const covered = document.documentElement.clientHeight - viewport.height;
      // Anything smaller is a browser bar settling, not a keyboard.
      if (Math.abs(viewport.scale - 1) > 0.01 || covered < 80) {
        element.style.removeProperty('--keyboard-top');
        element.style.removeProperty('--keyboard-height');
        delete element.dataset.keyboard;
        return;
      }
      element.style.setProperty('--keyboard-top', `${viewport.offsetTop}px`);
      element.style.setProperty('--keyboard-height', `${viewport.height}px`);
      element.dataset.keyboard = '';
      // What is being typed stays in sight in the smaller space.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && element.contains(active)) active.scrollIntoView({ block: 'nearest' });
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
    };
  }, [ref]);
}
