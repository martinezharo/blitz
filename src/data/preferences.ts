import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { LANGUAGES, type Language, WORD_SORTS, type WordSort } from '@blitz/core/word.ts';
import { setSoundsOn, sounds } from '../shared/sound.ts';

const KEY = 'blitz.language';

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(KEY);
    if (value && value in LANGUAGES) return value as Language;
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return 'de';
}

/** The language space currently open, remembered across visits. */
export function useLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState(storedLanguage);
  const choose = useCallback((next: Language) => {
    setLanguage(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembered, but still switched for this visit.
    }
  }, []);
  return [language, choose];
}

export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

const THEME_KEY = 'blitz.theme';
// Kept in step with the <meta name="theme-color"> tags in index.html.
const THEME_COLORS = { light: '#fefefd', dark: '#050505' } as const;

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // Storage can be blocked; follow the system.
  }
  return 'system';
}

/**
 * Dresses the page in a theme. "system" removes the pin, so the stylesheet
 * follows the device on its own; the inline script in index.html does the same
 * before first paint.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  // Browser chrome colour: pinned for an explicit theme, back to following the system otherwise.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = THEME_COLORS[theme === 'system' ? scheme : theme];
  });
}

/**
 * Wipes the new theme across the page from the control that was clicked, and
 * just applies it when the browser cannot or the person asked for less motion.
 */
function transition(update: () => void) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const origin = document.activeElement?.getBoundingClientRect();
  if (origin) {
    document.documentElement.style.setProperty('--theme-transition-x', `${origin.left + origin.width / 2}px`);
    document.documentElement.style.setProperty('--theme-transition-y', `${origin.top + origin.height / 2}px`);
  }
  document.startViewTransition(update).finished.catch(() => {});
}

/** The colour theme, remembered across visits. Follows the system until a choice is made. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState(storedTheme);
  // index.html already pinned the theme; this catches the browser chrome colour up.
  useEffect(() => applyTheme(theme), []);
  const choose = useCallback((next: Theme) => {
    transition(() => {
      // Flushed so the view transition captures the finished frame.
      flushSync(() => setTheme(next));
      applyTheme(next);
    });
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not remembered, but still applied for this visit.
    }
  }, []);
  return [theme, choose];
}

const SOUNDS_KEY = 'blitz.sounds';

function storedSounds(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Sound effects, on unless switched off on this device. */
export function useSounds(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(storedSounds);
  useEffect(() => setSoundsOn(on), [on]);
  const choose = useCallback((next: boolean) => {
    // The click plays while sound is still on, whichever way it goes.
    if (!next) sounds.toggle(false);
    setSoundsOn(next);
    setOn(next);
    if (next) sounds.toggle(true);
    try {
      localStorage.setItem(SOUNDS_KEY, next ? 'on' : 'off');
    } catch {
      // Not remembered, but still applied for this visit.
    }
  }, []);
  return [on, choose];
}

const SORT_KEY = 'blitz.sort';

function storedSort(): WordSort {
  try {
    const value = localStorage.getItem(SORT_KEY);
    const sort = WORD_SORTS.find((option) => option.value === value);
    if (sort) return sort.value;
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return 'newest';
}

/** How the word list is ordered, remembered across visits. Newest first until a choice is made. */
export function useWordSort(): [WordSort, (sort: WordSort) => void] {
  const [sort, setSort] = useState(storedSort);
  const choose = useCallback((next: WordSort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Not remembered, but still applied for this visit.
    }
  }, []);
  return [sort, choose];
}
