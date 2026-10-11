import { Apple, Briefcase, Palette, PersonStanding, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ListId } from '../../domain/lists.ts';

/**
 * How each list looks: the picture on its card and the colour of it, as the
 * name of one of the colours the app already has (global.css). A new list needs
 * an entry here, which the type insists on, and its words in lists-concepts.ts.
 */
const LOOKS: Record<ListId, { icon: LucideIcon; tint: 'accent' | 'der' | 'die' | 'das' }> = {
  food: { icon: Apple, tint: 'accent' },
  colours: { icon: Palette, tint: 'die' },
  body: { icon: PersonStanding, tint: 'der' },
  jobs: { icon: Briefcase, tint: 'das' },
};

export const listIcon = (id: ListId): LucideIcon => LOOKS[id].icon;

/** Puts the list's colour in `--tint` for whatever it is on and everything inside it. */
export const listTint = (id: ListId): CSSProperties => ({ '--tint': `var(--${LOOKS[id].tint})` }) as CSSProperties;
