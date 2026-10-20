import { useCallback, useSyncExternalStore } from 'react';
import { LANGUAGES, type Language, WORD_SORTS, type WordSort } from '@blitz/core/word.ts';
import { setSoundsOn } from '../platform/sound.ts';
import { changed, currentRevision, getMeta, setMeta, subscribe } from './db.ts';
import type { ThemeChoice } from '../theme/Theme';

/**
 * The small choices a device remembers: the language open, the theme, whether
 * it makes a sound, and how the list is ordered. The web app keeps them in
 * `localStorage`; here they live beside the words, and the same store that
 * redraws a list when a word is saved redraws these too.
 */

function useStored(key: string): [string | null, (value: string | null) => void] {
  useSyncExternalStore(subscribe, currentRevision, currentRevision);
  const value = getMeta(key);
  const set = useCallback(
    (next: string | null) => {
      setMeta(key, next);
      changed();
    },
    [key],
  );
  return [value, set];
}

const LANGUAGE_KEY = 'language';
const THEME_KEY = 'theme';
const SOUNDS_KEY = 'sounds';
const SORT_KEY = 'sort';

/** The language space currently open, remembered across launches. */
export function useLanguage(): [Language, (language: Language) => void] {
  const [stored, set] = useStored(LANGUAGE_KEY);
  const language = stored && stored in LANGUAGES ? (stored as Language) : 'de';
  return [language, useCallback((next: Language) => set(next), [set])];
}

/** The colour theme: the device's own until a choice is pinned. */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [stored, set] = useStored(THEME_KEY);
  const choice: ThemeChoice = stored === 'light' || stored === 'dark' ? stored : 'system';
  return [choice, useCallback((next: ThemeChoice) => set(next === 'system' ? null : next), [set])];
}

/** Sound effects, on unless switched off on this device. */
export function useSounds(): [boolean, (on: boolean) => void] {
  const [stored, set] = useStored(SOUNDS_KEY);
  const on = stored !== 'off';
  const choose = useCallback(
    (next: boolean) => {
      setSoundsOn(next);
      set(next ? null : 'off');
    },
    [set],
  );
  return [on, choose];
}

/** How the word list is ordered, remembered across launches. */
export function useWordSort(): [WordSort, (sort: WordSort) => void] {
  const [stored, set] = useStored(SORT_KEY);
  const sort = WORD_SORTS.find((option) => option.value === stored)?.value ?? 'newest';
  return [sort, useCallback((next: WordSort) => set(next), [set])];
}
