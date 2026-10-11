import { normalize } from './dictionary.ts';

/**
 * What a definition is: short, plain, about this meaning only. The models that
 * write them (scripts/curate-dictionary.ts, worker/definition.ts) are given the
 * same rules from here, and what they write is checked against the same limits.
 */

export const DEFINITION_LENGTH = {
  /** What the models are asked to stay under. */
  asked: 70,
  /** What is accepted: a little slack on what was asked. */
  most: 80,
  least: 5,
} as const;

/** The rules for a definition, as a list for a model's instructions. */
export const DEFINITION_STYLE = `- English, one short phrase, at most ${DEFINITION_LENGTH.asked} characters. Shorter is better.
- Plain everyday words a twelve-year-old knows. No jargon, no Latin or scientific names, no parentheses, no examples, no etymology, no usage notes.
- Begin with a capital letter. No full stop at the end.
- Things, animals, people: "A ..." / "An ..." ("A person who ..." for jobs and roles, in wording that fits men and women). Foods and materials: what it is or looks like. Body parts: where it is or what it does.
- Verbs: begin with "To ...". Adjectives: "Having ..." or "Describes ..."; colours: "The colour of ...". Adverbs: "In a ... way", or what they say about time, place or degree.
- Say what the thing IS or DOES so that someone who has never seen the word can recognise the meaning: name the category, then one distinguishing feature.
- Never use the word itself, its translation, or a word of the same family in the definition (no "A teacher is someone who teaches"). Never mention any language.`;

/**
 * A definition as a model wrote it, tidied (spaces, a full stop), or what is
 * wrong with it: too short or long, in brackets, or without a capital.
 */
export function checkDefinition(raw: unknown): { definition: string } | { problem: string } {
  const definition = (typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (!definition) return { problem: 'no definition' };
  if (definition.length < DEFINITION_LENGTH.least) return { problem: `definition of ${definition.length} characters` };
  if (definition.length > DEFINITION_LENGTH.most) return { problem: `definition of ${definition.length} characters` };
  if (/[()]/.test(definition)) return { problem: 'definition with brackets' };
  if (!/^\p{Lu}/u.test(definition)) return { problem: 'definition without a capital' };
  return { definition };
}

/**
 * What is wrong with a definition that is otherwise usable: it is longer than it
 * was asked to be, or it uses the word it defines (or its translation, or a word
 * that starts like one of them): "phone: To call someone using a phone". The
 * models are told not to, and mostly do not.
 */
export function definitionProblems(term: string, translations: readonly string[], definition: string): string[] {
  const problems: string[] = [];
  if (definition.length > DEFINITION_LENGTH.asked) problems.push(`${definition.length} characters`);
  const used = normalize(definition).split(' ').filter(Boolean);
  // The word, and what it is mostly translated as when that is one word: a long
  // translation ("lung cancer") is not a word to keep out of every definition.
  const first = translations[0]?.replace(/^to /i, '');
  const named = [term, first]
    .filter((name): name is string => !!name)
    .map(normalize)
    .filter((name) => name.length >= 3 && !name.includes(' '));
  for (const name of new Set(named)) {
    // The start of a long word stands for its family (sign, signal); a short one only for itself.
    const start = name.length <= 4 ? name : name.slice(0, Math.max(4, name.length - 2));
    if (used.some((word) => word === name || (start.length >= 4 && word.startsWith(start)))) {
      problems.push(`uses "${name}"`);
      break;
    }
  }
  return problems;
}
