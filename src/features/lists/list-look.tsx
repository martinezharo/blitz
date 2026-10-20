import { Icon, type IconNode } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ListSummary, ListTint } from '@blitz/core/lists.ts';

/** The colour of each tint a list may name, as one of the colours the app already has (global.css). */
const COLOUR: Record<ListTint, string> = { orange: 'accent', red: 'die', blue: 'der', green: 'das' };

/** Puts the list's colour in `--tint` for whatever it is on and everything inside it. */
export const listTint = (tint: ListTint): CSSProperties => ({ '--tint': `var(--${COLOUR[tint]})` }) as CSSProperties;

/** The picture of a list: the drawing of its Lucide icon, which comes with the list. */
export function ListIcon({ list }: { list: Pick<ListSummary, 'icon'> }) {
  return <Icon iconNode={list.icon as IconNode} aria-hidden="true" />;
}
