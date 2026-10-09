import type { Language, Word, WordType } from './word.ts';

/**
 * Common words that pad out multiple choice questions while a list is still
 * too short to give every option a word of its own. They are only ever wrong
 * options: they are never asked about and never saved.
 */
export type Filler = Pick<Word, 'type' | 'term' | 'article'>;

const nouns = (entries: string) =>
  entries.split(', ').map((entry): Filler => {
    const [article, term] = entry.includes(' ') ? entry.split(' ') : [null, entry];
    return { type: 'noun', term: term!, article };
  });

const words = (type: WordType, entries: string) =>
  entries.split(', ').map((term): Filler => ({ type, term, article: null }));

export const FILLERS: Record<Language, Filler[]> = {
  de: [
    ...nouns(
      'die Entscheidung, der Zusammenhang, die Gesellschaft, das Verhältnis, die Voraussetzung, der Fortschritt, ' +
        'die Verantwortung, das Ereignis, der Unterschied, die Anforderung, die Erfahrung, das Bewusstsein, ' +
        'der Vorschlag, die Herausforderung, die Umgebung, das Vorurteil',
    ),
    ...words(
      'verb',
      'entwickeln, verhandeln, erwägen, bewältigen, voraussetzen, vermeiden, beeinflussen, bezweifeln, ' +
        'vernachlässigen, durchsetzen, erörtern, anstreben',
    ),
    ...words(
      'adjective',
      'zuverlässig, anspruchsvoll, vorsichtig, eindeutig, mühsam, großzügig, unvermeidlich, zweifelhaft, ' +
        'gründlich, vorübergehend, selbstverständlich, bescheiden',
    ),
    ...words(
      'adverb',
      'allmählich, vermutlich, keineswegs, ausnahmsweise, neuerdings, zunehmend, übrigens, beinahe, ' +
        'ausschließlich, schlichtweg, demnach, insbesondere',
    ),
    ...words(
      'other',
      'obwohl, trotzdem, dennoch, außerdem, hingegen, somit, sofern, solange, zumal, entsprechend, ' +
        'angesichts, hinsichtlich',
    ),
  ],
  en: [
    ...nouns(
      'decision, consequence, society, relationship, prerequisite, progress, responsibility, occasion, ' +
        'distinction, requirement, experience, awareness, proposal, challenge, surroundings, prejudice',
    ),
    ...words(
      'verb',
      'develop, negotiate, consider, overcome, presume, avoid, influence, doubt, neglect, enforce, ' +
        'discuss, strive',
    ),
    ...words(
      'adjective',
      'reliable, demanding, cautious, unambiguous, tedious, generous, inevitable, dubious, thorough, ' +
        'temporary, obvious, modest',
    ),
    ...words(
      'adverb',
      'gradually, presumably, by no means, exceptionally, lately, increasingly, incidentally, nearly, ' +
        'exclusively, simply, accordingly, particularly',
    ),
    ...words(
      'other',
      'although, nevertheless, however, moreover, whereas, hence, provided that, as long as, especially, ' +
        'according to, in view of, regarding',
    ),
  ],
};
