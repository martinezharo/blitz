import { Check, ChevronDown } from 'lucide-react';
import { useRef } from 'react';
import { LANGUAGE_ORDER, LANGUAGES, type Language } from '@blitz/core/word.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './language-menu.module.css';

/** Switches the language space. A native popover, so outside clicks and Escape close it. */
export function LanguageMenu({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const current = LANGUAGES[language];

  return (
    <>
      <button type="button" className={styles.trigger} popoverTarget="language-menu" aria-label={`Language: ${current.name}`}>
        <span className={styles.flag} aria-hidden="true">
          {current.flag}
        </span>
        {current.name}
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>
      <div ref={menu} id="language-menu" popover="auto" className={styles.menu}>
        {LANGUAGE_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.option}
            aria-pressed={option === language}
            onClick={() => {
              if (option !== language) sounds.tap();
              onChange(option);
              menu.current?.hidePopover();
            }}
          >
            <span className={styles.flag} aria-hidden="true">
              {LANGUAGES[option].flag}
            </span>
            {LANGUAGES[option].name}
            {option === language && <Check className={styles.check} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </>
  );
}
