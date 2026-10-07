import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import styles from './sheet.module.css';

interface SheetProps {
  eyebrow: ReactNode;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * A bottom sheet on phones and a centred modal from tablet width up. Built on
 * <dialog>, so focus trapping and Escape come from the browser. Mount it to
 * open it; unmount it to close it.
 */
export function Sheet({ eyebrow, title, onClose, footer, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
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
      <div className={styles.grabber} aria-hidden="true" />
      <header className={styles.head}>
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
