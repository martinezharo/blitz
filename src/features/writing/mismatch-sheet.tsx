import { LANGUAGES, type Language } from '../../domain/word.ts';
import { sounds } from '../../shared/sound.ts';
import { Sheet } from '../../shared/ui/sheet.tsx';
import styles from './writing.module.css';

/** Why a text was not checked in the language of the page. */
export type Mismatch =
  /** It is in the other language Blitz has. */
  | { kind: 'switch'; to: Language }
  /** It is in a language Blitz does not have; `name` when it is known. */
  | { kind: 'unsupported'; name: string | null }
  /** It is not a text in any language. */
  | { kind: 'nonsense' };

/** Says the text is not in the language of the page, and offers the one it is in. */
export function MismatchSheet({
  language,
  mismatch,
  onSwitch,
  onClose,
}: {
  language: Language;
  mismatch: Mismatch;
  onSwitch: (language: Language) => void;
  onClose: () => void;
}) {
  const spec = LANGUAGES[language];
  const supported = Object.values(LANGUAGES)
    .map((option) => option.name)
    .join(' and ');

  let title: string;
  let body: string;
  if (mismatch.kind === 'switch') {
    const other = LANGUAGES[mismatch.to];
    title = `This looks like ${other.name}`;
    body = `You are on your ${spec.name} page. Move the text to ${other.name} and check it there?`;
  } else if (mismatch.kind === 'unsupported') {
    title = mismatch.name ? `Blitz can't check ${mismatch.name} yet` : `This doesn't look like ${spec.name}`;
    body = `For now, Blitz checks ${supported}. Write it in ${spec.name} and check again.`;
  } else {
    title = `This doesn't read as ${spec.name}`;
    body = `Write a few real sentences in ${spec.name} and check again.`;
  }

  return (
    <Sheet
      eyebrow={`${spec.flag} ${spec.name}`}
      title={title}
      onClose={onClose}
      footer={
        mismatch.kind === 'switch' ? (
          <>
            <button type="button" className={`${styles.button} ${styles.buttonQuiet}`} onClick={onClose}>
              Keep editing
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonMain}`}
              onClick={() => {
                sounds.tap();
                onSwitch(mismatch.to);
              }}
            >
              {LANGUAGES[mismatch.to].flag} Check in {LANGUAGES[mismatch.to].name}
            </button>
          </>
        ) : (
          <button type="button" className={`${styles.button} ${styles.buttonMain}`} onClick={onClose}>
            Got it
          </button>
        )
      }
    >
      <p className={styles.sheetText}>{body}</p>
    </Sheet>
  );
}
