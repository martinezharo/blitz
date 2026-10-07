import { useCallback, useState } from 'react';
import { LANGUAGES, type Language } from '../domain/word.ts';

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
