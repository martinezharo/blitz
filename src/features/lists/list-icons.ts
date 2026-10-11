import { Apple, Briefcase, Palette, PersonStanding, type LucideIcon } from 'lucide-react';
import type { ListId } from '../../domain/lists.ts';

/** The picture on each list's card. */
export const LIST_ICONS: Record<ListId, LucideIcon> = {
  food: Apple,
  colours: Palette,
  body: PersonStanding,
  jobs: Briefcase,
};
