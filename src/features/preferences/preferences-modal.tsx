import { Monitor, Moon, Settings2, Sun, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { THEMES, type Theme } from '../../data/preferences.ts';
import styles from './preferences.module.css';

const THEME_OPTIONS: Record<Theme, { label: string; icon: ReactNode }> = {
  system: { label: 'System', icon: <Monitor aria-hidden="true" /> },
  light: { label: 'Light', icon: <Sun aria-hidden="true" /> },
  dark: { label: 'Dark', icon: <Moon aria-hidden="true" /> },
};

/**
 * The preferences card, the same one Akin shows. Mount it to open it; unmount
 * it to close it.
 */
export function PreferencesModal({
  theme,
  onThemeChange,
  onDismiss,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="preferences-title"
      aria-describedby="preferences-description"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className={styles.card}>
        <button className={styles.close} type="button" onClick={onDismiss} aria-label="Close">
          <X aria-hidden="true" />
        </button>
        <div className={styles.head}>
          <div className={styles.mark} aria-hidden="true">
            <Settings2 />
          </div>
          <p className={styles.eyebrow}>Preferences</p>
          <h2 id="preferences-title">Make it yours</h2>
          <p className={styles.intro} id="preferences-description">
            Saved on this device.
          </p>
        </div>

        <section className={styles.setting} aria-labelledby="theme-label">
          <div className={styles.settingCopy}>
            <strong id="theme-label">Theme</strong>
            <small>System follows your device.</small>
          </div>
          <div className={styles.themePicker} data-theme={theme} role="group" aria-labelledby="theme-label">
            {THEMES.map((option) => (
              <button key={option} type="button" aria-pressed={option === theme} onClick={() => onThemeChange(option)}>
                {THEME_OPTIONS[option].icon}
                <strong>{THEME_OPTIONS[option].label}</strong>
              </button>
            ))}
          </div>
        </section>
      </div>
    </dialog>
  );
}
