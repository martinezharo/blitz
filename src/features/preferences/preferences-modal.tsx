import { Download, Monitor, Moon, Settings2, Share, Sun, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { install, useInstallMode } from '../../data/install.ts';
import { THEMES, type Theme } from '../../data/preferences.ts';
import { sounds } from '../../shared/sound.ts';
import styles from './preferences.module.css';

const THEME_OPTIONS: Record<Theme, { label: string; icon: ReactNode }> = {
  system: { label: 'System', icon: <Monitor aria-hidden="true" /> },
  light: { label: 'Light', icon: <Sun aria-hidden="true" /> },
  dark: { label: 'Dark', icon: <Moon aria-hidden="true" /> },
};

/** Whether a theme ends up light, which clicks higher than dark. */
function isLight(theme: Theme): boolean {
  return theme === 'light' || (theme === 'system' && !matchMedia('(prefers-color-scheme: dark)').matches);
}

/**
 * The preferences card, the same one Akin shows. Mount it to open it; unmount
 * it to close it.
 */
export function PreferencesModal({
  theme,
  onThemeChange,
  showInstall,
  soundsOn,
  onSoundsChange,
  onDismiss,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  /** Offer to install the app, for people with no account menu to hold it. */
  showInstall: boolean;
  soundsOn: boolean;
  onSoundsChange: (on: boolean) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dismiss = () => {
    sounds.close();
    onDismiss();
  };

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
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className={styles.card}>
        <button className={styles.close} type="button" onClick={dismiss} aria-label="Close">
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
              <button
                key={option}
                type="button"
                aria-pressed={option === theme}
                onClick={() => {
                  if (option !== theme) sounds.toggle(isLight(option));
                  onThemeChange(option);
                }}
              >
                {THEME_OPTIONS[option].icon}
                <strong>{THEME_OPTIONS[option].label}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className={`${styles.setting} ${styles.inline}`} aria-labelledby="sounds-label">
          <div className={styles.settingCopy}>
            <strong id="sounds-label">Sounds</strong>
            <small>Taps, answers and finished lessons.</small>
          </div>
          <button
            className={styles.switch}
            type="button"
            aria-pressed={soundsOn}
            aria-labelledby="sounds-label"
            onClick={() => onSoundsChange(!soundsOn)}
          >
            <i aria-hidden="true" />
          </button>
        </section>

        {showInstall && <InstallSetting />}

        <p className={styles.credit}>
          Word suggestions come from{' '}
          <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer">
            Wiktionary
          </a>
          , under CC BY-SA.
        </p>
      </div>
    </dialog>
  );
}

/** Install for guests; on wide screens the corner button already does it. */
function InstallSetting() {
  const mode = useInstallMode();
  if (!mode) return null;
  return (
    <section className={`${styles.setting} ${styles.inline} ${styles.install}`} data-mode={mode} aria-labelledby="install-label">
      <div className={styles.settingCopy}>
        <strong id="install-label">Install app</strong>
        <small>{mode === 'native' ? 'Open Blitz from your home screen, even offline.' : 'Tap Share, then Add to Home Screen.'}</small>
      </div>
      {mode === 'native' ? (
        <button
          className={styles.installButton}
          type="button"
          onClick={() => {
            sounds.open();
            void install();
          }}
        >
          <Download aria-hidden="true" />
          Install
        </button>
      ) : (
        <Share className={styles.installHint} aria-hidden="true" />
      )}
    </section>
  );
}
