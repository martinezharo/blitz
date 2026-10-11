import type { WordType } from './word.ts';

/**
 * What the ready-made lists hold: only which meanings, as their English word and
 * their German one (with the article, for a noun). Everything else about a word,
 * from its plural to its definition, is the dictionary's: `pnpm lists` copies it
 * from the curated dictionary into lists-words.json, so a word imported from a
 * list is the same word as one picked from the dictionary.
 */

interface Concept {
  type: Extract<WordType, 'noun' | 'adjective'>;
  en: string;
  de: string;
  /** der, die or das. Nouns only. */
  article?: string;
}

const noun = (en: string, article: string, de: string): Concept => ({ type: 'noun', en, de, article });
const adjective = (en: string, de: string): Concept => ({ type: 'adjective', en, de });

export const LIST_CONCEPTS = [
  {
    id: 'food',
    name: 'Food',
    concepts: [
      noun('apple', 'der', 'Apfel'),
      noun('banana', 'die', 'Banane'),
      noun('orange', 'die', 'Orange'),
      noun('strawberry', 'die', 'Erdbeere'),
      noun('potato', 'die', 'Kartoffel'),
      noun('tomato', 'die', 'Tomate'),
      noun('onion', 'die', 'Zwiebel'),
      noun('bread', 'das', 'Brot'),
      noun('cheese', 'der', 'Käse'),
      noun('egg', 'das', 'Ei'),
      noun('milk', 'die', 'Milch'),
      noun('butter', 'die', 'Butter'),
      noun('rice', 'der', 'Reis'),
      noun('meat', 'das', 'Fleisch'),
      noun('fish', 'der', 'Fisch'),
      noun('cake', 'der', 'Kuchen'),
    ],
  },
  {
    id: 'colours',
    name: 'Colours',
    concepts: [
      adjective('red', 'rot'),
      adjective('blue', 'blau'),
      adjective('green', 'grün'),
      adjective('yellow', 'gelb'),
      adjective('black', 'schwarz'),
      adjective('white', 'weiß'),
      adjective('grey', 'grau'),
      adjective('brown', 'braun'),
      adjective('orange', 'orange'),
      adjective('pink', 'rosa'),
      adjective('purple', 'lila'),
    ],
  },
  {
    id: 'body',
    name: 'Body',
    concepts: [
      noun('head', 'der', 'Kopf'),
      noun('face', 'das', 'Gesicht'),
      noun('eye', 'das', 'Auge'),
      noun('ear', 'das', 'Ohr'),
      noun('nose', 'die', 'Nase'),
      noun('mouth', 'der', 'Mund'),
      noun('tooth', 'der', 'Zahn'),
      noun('neck', 'der', 'Hals'),
      noun('shoulder', 'die', 'Schulter'),
      noun('arm', 'der', 'Arm'),
      noun('hand', 'die', 'Hand'),
      noun('finger', 'der', 'Finger'),
      noun('belly', 'der', 'Bauch'),
      noun('back', 'der', 'Rücken'),
      noun('leg', 'das', 'Bein'),
      noun('knee', 'das', 'Knie'),
      noun('foot', 'der', 'Fuß'),
      noun('heart', 'das', 'Herz'),
    ],
  },
  {
    id: 'jobs',
    name: 'Jobs',
    concepts: [
      noun('teacher', 'der', 'Lehrer'),
      noun('doctor', 'der', 'Arzt'),
      noun('cook', 'der', 'Koch'),
      noun('baker', 'der', 'Bäcker'),
      noun('police officer', 'der', 'Polizist'),
      noun('shop assistant', 'der', 'Verkäufer'),
      noun('engineer', 'der', 'Ingenieur'),
      noun('hairdresser', 'der', 'Friseur'),
      noun('waiter', 'der', 'Kellner'),
      noun('lawyer', 'der', 'Anwalt'),
      noun('pilot', 'der', 'Pilot'),
      noun('actor', 'der', 'Schauspieler'),
    ],
  },
] as const satisfies readonly { id: string; name: string; concepts: readonly Concept[] }[];

export type ListId = (typeof LIST_CONCEPTS)[number]['id'];
