import type { Language } from './word.ts';

/**
 * A small guess at the language of a text, made in the browser before it is
 * sent to be checked: the most common little words of each language are
 * counted. It only speaks when it is sure, and the model has the last word.
 */

/** Languages it can tell apart. The ones Blitz has, and the ones learners most often mix up with them. */
export type Guess = Language | 'es' | 'fr' | 'it' | 'pt' | 'nl';

export const GUESS_NAMES: Record<Guess, string> = {
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
};

// Common little words of each language. One that two of them share (es, que,
// hier, tu…) tells nothing, so it is dropped from both below.
const WORDS: Record<Guess, string> = {
  de: 'der das und ist ich nicht ein eine einen dem den des zu mit sich auf für von sie wir auch es sind war wird bei aus nach wie noch nur oder aber wenn dann schon sehr mein meine dein ihr uns habe hat haben bin bist gehe heute gestern morgen weil dass mir mich dir dich kein keine ganz viel gern immer jetzt hier wo warum',
  en: 'the and is are you that it of with for this have has was were not they he she we my your our would could will can be been being do does did very what when where why which there their about from just because yesterday today tomorrow went got had like',
  es: 'el los las y es son que una del por para con no lo se le muy pero como más está estoy soy tengo yo mi tu nosotros ella ellos ayer hoy mañana porque también hola gusta vivo',
  fr: 'le les et est sont que une des du pour avec ne pas je tu il elle nous vous ils mais très au aux suis ai mon ma mes ce cette qui dans sur aussi bonjour hier aujourd demain parce habite',
  it: 'il lo gli e è sono che una del della per con non mi ti si io tu lui lei noi voi ma molto anche sono ho ciao ieri oggi domani perché questo questa',
  pt: 'o os as e é são que uma do da dos das para com não eu tu ele ela nós mas muito também estou sou tenho meu minha você olá ontem hoje amanhã porque',
  nl: 'het een en is zijn dat van voor met niet ik jij je hij zij wij maar ook heb heeft ben was wordt bij naar hoe nog zeer mijn jouw onze gisteren vandaag morgen omdat',
};

const lists = Object.entries(WORDS).map(([language, words]) => [language, new Set(words.split(' '))] as const);
const shared = new Set(lists.flatMap(([, words], index) => [...words].filter((word) => lists.some(([, other], at) => at !== index && other.has(word)))));
const SETS = Object.fromEntries(lists.map(([language, words]) => [language, new Set([...words].filter((word) => !shared.has(word)))])) as Record<Guess, Set<string>>;

/** Fewer words than this and it does not guess. */
const MIN_WORDS = 4;

/**
 * The language the text is most likely in, or null when it cannot tell: too
 * short, no common words at all, or two languages too close to call.
 */
export function guessLanguage(text: string): Guess | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < MIN_WORDS) return null;
  const scores = (Object.keys(SETS) as Guess[])
    .map((language) => ({ language, score: words.filter((word) => SETS[language].has(word)).length }))
    .sort((a, b) => b.score - a.score);
  const [best, next] = scores as [{ language: Guess; score: number }, { language: Guess; score: number }];
  // At least two of its words, a fair share of the text, and clearly ahead.
  if (best.score < 2 || best.score < words.length * 0.15 || best.score < next.score * 2) return null;
  return best.language;
}
