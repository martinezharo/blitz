import { useEffect, useState } from 'react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { FONTS, PALETTE, type Palette, type Scheme } from './tokens';

export type ThemeChoice = 'system' | 'light' | 'dark';

interface ThemeValue {
  scheme: Scheme;
  palette: Palette;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * The theme, following the device until a choice is pinned, as on the web.
 * `onChange` lets whoever keeps the choice on disk hear about it.
 */
export function ThemeProvider({
  children,
  stored,
  onChange,
}: {
  children: ReactNode;
  stored: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  const system = useColorScheme();
  const [choice, setChoice] = useState<ThemeChoice>(stored);

  useEffect(() => setChoice(stored), [stored]);

  const value = useMemo<ThemeValue>(() => {
    const scheme: Scheme = choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice;
    return {
      scheme,
      palette: PALETTE[scheme],
      choice,
      setChoice: (next: ThemeChoice) => {
        setChoice(next);
        onChange(next);
      },
    };
  }, [choice, system, onChange]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme outside ThemeProvider');
  return value;
}

/** The font family for a weight, as the tokens name it. */
export const font = (weight: keyof typeof FONTS = 'body') => FONTS[weight];
