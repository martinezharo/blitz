import { ArrowRight, Cloud, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './account.module.css';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.34ZM12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Zm-5.59-8.1A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.51H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.49l3.34-2.59ZM12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.51l3.34 2.59C7.2 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}

/**
 * Asks the visitor to sign in with Google, the same card Akin shows. Mount it
 * to open it; unmount it to close it.
 */
export function AuthModal({ error, onSignIn, onDismiss }: { error: string | null; onSignIn: () => void; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.authDialog}
      aria-labelledby="auth-title"
      aria-describedby="auth-description"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className={styles.authCard}>
        <button className={styles.close} type="button" onClick={onDismiss} aria-label="Close">
          <X aria-hidden="true" />
        </button>
        <img className={styles.authMark} src="/logo.svg" alt="" />
        <p className={styles.eyebrow}>Make it yours</p>
        <h2 className={styles.authTitle} id="auth-title">
          Take your words everywhere.
        </h2>
        <p className={styles.authCopy} id="auth-description">
          Sign in with Google and every word you pick follows you, on this browser and every other one.
        </p>
        <ul className={styles.authBenefits} aria-label="Account benefits">
          <li>
            <span>
              <Cloud aria-hidden="true" />
            </span>
            Keep your words and pictures synced on every device
          </li>
          <li>
            <span>
              <Smartphone aria-hidden="true" />
            </span>
            Add a word on your phone, practise it on your laptop
          </li>
          <li>
            <span>
              <ShieldCheck aria-hidden="true" />
            </span>
            Safe even if this browser forgets everything
          </li>
        </ul>

        {error && (
          <p className={styles.authError} role="alert">
            {error}
          </p>
        )}
        <button
          className={styles.googleSubmit}
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            onSignIn();
          }}
        >
          <span className={styles.googleBadge}>
            <GoogleMark />
          </span>
          <strong>{pending ? 'Heading to Google…' : 'Continue with Google'}</strong>
          <ArrowRight aria-hidden="true" />
        </button>
        <p className={styles.authFootnote}>Words you added before signing in come along.</p>
      </div>
    </dialog>
  );
}
