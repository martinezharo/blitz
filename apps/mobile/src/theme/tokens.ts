/**
 * The same tokens as the web app's `global.css`, as values React Native can
 * use. Colours keep their light/dark pairs; sizes are rem × 16, rounded.
 */

export type Scheme = 'light' | 'dark';

export interface Palette {
  background: string;
  foreground: string;
  muted: string;
  faint: string;
  line: string;
  buttonBackground: string;
  buttonForeground: string;
  buttonMuted: string;
  accent: string;
  accentShadow: string;
  accentInk: string;
  danger: string;
  success: string;
  selection: string;
  selectionForeground: string;
  iconBackground: string;
  iconHover: string;
  surface: string;
  /** German genders, coloured the way most learners' material does. */
  der: string;
  die: string;
  das: string;
}

export const PALETTE: Record<Scheme, Palette> = {
  light: {
    background: '#fefefd',
    foreground: '#121311',
    muted: '#74776f',
    faint: '#b0b2ab',
    line: '#e7e8e3',
    buttonBackground: '#161714',
    buttonForeground: '#ffffff',
    buttonMuted: '#b7b9b1',
    accent: '#e84b1b',
    accentShadow: 'rgba(232, 75, 27, 0.32)',
    accentInk: '#2f1107',
    danger: '#c4314b',
    success: '#2e9a5a',
    selection: '#ffd382',
    selectionForeground: '#321207',
    iconBackground: '#f3f3ef',
    iconHover: '#e9eae4',
    surface: '#ffffff',
    der: '#2f6fdb',
    die: '#d8344f',
    das: '#2e9a5a',
  },
  dark: {
    background: '#050505',
    foreground: '#f7f8f3',
    muted: '#8b8e87',
    faint: '#5b5e56',
    line: '#292b27',
    buttonBackground: '#f4f5f0',
    buttonForeground: '#0b0c0a',
    buttonMuted: '#5b5e56',
    accent: '#ff7540',
    accentShadow: 'rgba(255, 117, 64, 0.28)',
    accentInk: '#2f1107',
    danger: '#ff6b84',
    success: '#4cc57f',
    selection: '#9d341e',
    selectionForeground: '#ffffff',
    iconBackground: '#171815',
    iconHover: '#252720',
    surface: '#0d0e0c',
    der: '#6da0ff',
    die: '#ff6b84',
    das: '#4cc57f',
  },
};

/** Nunito, the face both apps wear. Loaded in `useAppFonts`. */
export const FONTS = {
  regular: 'Nunito-600',
  body: 'Nunito-700',
  strong: 'Nunito-800',
  black: 'Nunito-900',
} as const;

export const TEXT = {
  '2xs': 9,
  xs: 10,
  sm: 11.5,
  md: 13,
  lg: 15,
  xl: 17.5,
  '2xl': 23,
  '4xl': 31,
} as const;

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 21.5,
  xl: 28,
  pill: 999,
} as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 } as const;

export const GUTTER = 16;
/** The widest the column ever gets, as in the web app. */
export const COLUMN = 640;

/** The article's colour, wherever one is shown. */
export function articleColour(palette: Palette, article: string | null | undefined): string | undefined {
  if (article === 'der') return palette.der;
  if (article === 'die') return palette.die;
  if (article === 'das') return palette.das;
  return undefined;
}
