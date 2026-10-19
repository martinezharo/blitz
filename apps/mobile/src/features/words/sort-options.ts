import { ArrowDown01, ArrowDown10, ArrowDownAZ, ArrowDownWideNarrow, ArrowUpAZ, ArrowUpNarrowWide, type LucideIcon } from 'lucide-react-native';
import type { WordSort } from '@blitz/core/word.ts';

export { WORD_SORTS, type WordSort } from '@blitz/core/word.ts';

export const ARROW: Record<WordSort, LucideIcon> = {
  newest: ArrowDownWideNarrow,
  oldest: ArrowUpNarrowWide,
  az: ArrowDownAZ,
  za: ArrowUpAZ,
  levelUp: ArrowDown01,
  levelDown: ArrowDown10,
};
