import { X } from 'lucide-react';
import { type PointerEvent, type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';
import { type MorphEnds, morphEndsIn } from './morph.ts';
import styles from './sheet.module.css';

interface SheetProps {
  eyebrow: ReactNode;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}

/** How far down, as a share of its height, a released sheet has to be to close. */
const DISMISS_SHARE = 0.3;
/** A flick at least this fast (px/ms) closes it however far it went. */
const DISMISS_SPEED = 0.5;
const SETTLE = { duration: 240, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', fill: 'forwards' } as const;

/**
 * Lets the phone sheet be pulled down by its grabber or header: it follows the
 * finger, the backdrop fades with it, and on release it either slides away and
 * closes or springs back. From tablet width up, where the sheet is a centred
 * modal, it does nothing.
 */
function useDragToDismiss(ref: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const drag = useRef<{ id: number; startY: number; y: number; at: number; speed: number } | null>(null);

  function move(dialog: HTMLDialogElement, offset: number) {
    // Upwards it only gives a little, like a rubber band.
    const y = offset < 0 ? -Math.sqrt(-offset) : offset;
    dialog.style.transform = `translateY(${y}px)`;
    dialog.style.setProperty('--drag', String(Math.max(0, y) / dialog.offsetHeight));
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || (event.target as Element).closest('button')) return;
      if (matchMedia('(min-width: 48rem)').matches) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      ref.current!.getAnimations().forEach((animation) => animation.cancel());
      drag.current = { id: event.pointerId, startY: event.clientY, y: event.clientY, at: event.timeStamp, speed: 0 };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const state = drag.current;
      if (!state || state.id !== event.pointerId) return;
      const elapsed = event.timeStamp - state.at;
      if (elapsed > 0) state.speed = (event.clientY - state.y) / elapsed;
      state.y = event.clientY;
      state.at = event.timeStamp;
      move(ref.current!, event.clientY - state.startY);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const state = drag.current;
      if (!state || state.id !== event.pointerId) return;
      drag.current = null;
      const dialog = ref.current!;
      const offset = event.clientY - state.startY;
      const from = dialog.style.transform || 'translateY(0)';
      dialog.style.transform = '';
      dialog.style.removeProperty('--drag');

      if (offset > dialog.offsetHeight * DISMISS_SHARE || state.speed > DISMISS_SPEED) {
        // Gone off screen, so there is nothing left to morph back.
        dialog.dataset.draggedAway = '';
        dialog.animate({ transform: [from, 'translateY(100%)'] }, SETTLE).finished.then(onClose, () => {});
      } else {
        dialog.animate({ transform: [from, 'translateY(0)'] }, { ...SETTLE, fill: 'none' });
      }
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null;
      const dialog = ref.current!;
      dialog.style.transform = '';
      dialog.style.removeProperty('--drag');
    },
  };
}

/**
 * A bottom sheet on phones and a centred modal from tablet width up. Built on
 * <dialog>, so focus trapping and Escape come from the browser; on phones it
 * can also be pulled down to close. Mount it to open it; unmount it to close it.
 */
export function Sheet({ eyebrow, title, onClose, footer, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dragHandle = useDragToDismiss(ref, onClose);

  // A layout effect, so the dialog is already open when a morph looks for it.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    // React's autoFocus fires before the dialog opens, so it is done here.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      data-sheet
      aria-labelledby="sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog itself is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.grabber} aria-hidden="true" {...dragHandle} />
      <header className={styles.head} {...dragHandle}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 id="sheet-title">{title}</h2>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
      <footer className={styles.foot}>{footer}</footer>
    </dialog>
  );
}

/** The open sheet as a morph target; its word is whatever carries `data-morph-term`. */
export function openSheetEnds(): MorphEnds | null {
  return morphEndsIn(document.querySelector<HTMLElement>('dialog[data-sheet][open]:not([data-dragged-away])'));
}
