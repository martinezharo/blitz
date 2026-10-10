import { FILLERS, type Filler } from './fillers.ts';
import { counterpartArticle, MAX_LEVEL, type Sex, sexOf, type Word } from './word.ts';

/**
 * How practice works. Each word climbs five levels, each one a harder kind of
 * question. Three right answers in a row move a word up; one wrong answer
 * moves it down. Past the top level a word keeps coming back, and a single
 * miss drops it to level four again. Right answers in a row at the top level
 * are counted too: once there are more than five, the word is offered for the
 * archive, where it stops coming back.
 */

const LESSON_SIZE = 10;
/** Right answers in a row that move a word up a level. */
const STREAK_TO_LEVEL_UP = 3;
/** Right answers in a row at the top level that make a word worth archiving: more than five. */
export const STREAK_TO_ARCHIVE = 6;

type Random = () => number;

/** Words from before practice existed were stored at level 0. */
export function levelOf(word: Pick<Word, 'level'>): number {
  return Math.min(MAX_LEVEL, Math.max(1, word.level));
}

/** How much of a list is learned: the sum of its levels, out of every word at the top. Archived words count as learned. */
export function mastery(words: Pick<Word, 'level' | 'archived'>[]): { points: number; max: number } {
  const points = words.reduce((sum, word) => sum + (word.archived ? MAX_LEVEL : levelOf(word)), 0);
  return { points, max: words.length * MAX_LEVEL };
}

export function progress(word: Pick<Word, 'level' | 'streak'>, correct: boolean): { level: number; streak: number } {
  const level = levelOf(word);
  if (!correct) return { level: Math.max(1, level - 1), streak: 0 };
  const streak = (word.streak ?? 0) + 1;
  if (streak >= STREAK_TO_LEVEL_UP && level < MAX_LEVEL) return { level: level + 1, streak: 0 };
  // At the top the streak keeps counting, but stops once it has passed the archive offer.
  return { level, streak: level < MAX_LEVEL ? streak : Math.min(streak, STREAK_TO_ARCHIVE + 1) };
}

/** Whether this answer is the one that makes the word worth archiving. Asked once per run of right answers. */
export function offersArchive(word: Pick<Word, 'level' | 'streak'>): boolean {
  return levelOf(word) === MAX_LEVEL && word.streak === STREAK_TO_ARCHIVE;
}

/** About ten questions, fewer while there are only a couple of words. */
export function lessonLength(words: number): number {
  return Math.min(LESSON_SIZE, words * STREAK_TO_LEVEL_UP);
}

/**
 * The word ids a lesson asks about, in order. Lower levels come up more
 * often, and a word only repeats once every other word has had its turn.
 */
export function pickLesson(words: Pick<Word, 'id' | 'level'>[], random: Random = Math.random): string[] {
  const size = lessonLength(words.length);
  const lesson: string[] = [];
  let pool: typeof words = [];
  while (lesson.length < size) {
    if (pool.length === 0) pool = [...words];
    const weights = pool.map((word) => MAX_LEVEL + 1 - levelOf(word));
    let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
    let index = weights.findIndex((weight) => (roll -= weight) < 0);
    if (index < 0) index = pool.length - 1;
    // Never the same word twice in a row, when there is another to ask.
    if (pool[index]!.id === lesson.at(-1) && pool.length > 1) index = (index + 1) % pool.length;
    lesson.push(pool[index]!.id);
    pool.splice(index, 1);
  }
  return lesson;
}

export type Clue = { kind: 'photo'; photo: Blob } | { kind: 'translation' | 'definition'; text: string };

export type Gender = 'shown' | 'pick' | 'write' | null;

export type Answer =
  | { kind: 'choice'; options: string[] }
  | { kind: 'letters'; tiles: string[]; given: boolean[] }
  | { kind: 'write'; hint: string };

export interface Exercise {
  word: Word;
  level: number;
  /**
   * What the answer is: the word, or its counterpart of the other sex. Half
   * the time a word with a counterpart asks for the counterpart instead.
   */
  term: string;
  article: string | null;
  /** Which sex is asked for, when the word has a counterpart and it has to be said. Null otherwise. */
  sex: Sex | null;
  clue: Clue;
  /** How the article is asked. Null when the word has none. */
  gender: Gender;
  answer: Answer;
}

const CHOICES: Record<number, number> = { 1: 4, 2: 8 };

export function buildExercise(word: Word, words: Word[], random: Random = Math.random): Exercise {
  const level = levelOf(word);
  const clues: Clue[] = [];
  if (word.photo) clues.push({ kind: 'photo', photo: word.photo });
  if (word.translation) clues.push({ kind: 'translation', text: word.translation });
  if (word.definition) clues.push({ kind: 'definition', text: word.definition });
  const clue = clues[Math.floor(random() * clues.length)]!;

  // The counterpart is only asked when the article says which sex each form is.
  const counterpart = word.counterpart && sexOf(word.article) ? word.counterpart : null;
  const other = counterpart !== null && random() < 0.5;
  const term = other ? counterpart! : word.term;
  const article = other ? counterpartArticle(word.article) : word.article;
  const sex = counterpart === null ? null : sexOf(article);

  const gender: Gender = !article ? null : level === 1 ? 'shown' : level <= 3 ? 'pick' : 'write';

  let answer: Answer;
  if (level <= 2) {
    const label = (option: Filler) => (gender === 'shown' && option.article ? `${option.article} ${option.term}` : option.term);
    const correct = label({ type: word.type, term, article });
    // Common words make up the numbers while the list is short, never one already in it.
    const fillers = FILLERS[word.language].filter((filler) => !words.some((other) => sameText(other.term, filler.term)));
    // Same kind of word first, so the wrong options are not giveaways, and the
    // user's own words before the fillers.
    const others = [...shuffle(words.filter((other) => other.id !== word.id), random), ...shuffle(fillers, random)].sort(
      (a, b) => Number(b.type === word.type) - Number(a.type === word.type),
    );
    const options = new Set([correct]);
    // The other form is the trickiest wrong option: it takes reading which sex is asked.
    if (counterpart !== null) {
      options.add(other ? label(word) : label({ type: word.type, term: counterpart, article: counterpartArticle(word.article) }));
    }
    for (const other of others) {
      if (options.size >= CHOICES[level]!) break;
      options.add(label(other));
    }
    answer = { kind: 'choice', options: shuffle([...options], random) };
  } else if (level === 3) {
    // A third of the letters start in place, so only the rest are left to order.
    const chars = [...term];
    const places = chars.flatMap((char, index) => (/\s/.test(char) ? [] : [index]));
    const kept = places.length < 2 ? 0 : Math.max(1, Math.round(places.length / 3));
    const given = chars.map(() => false);
    for (const index of shuffle(places, random).slice(0, kept)) given[index] = true;
    const letters = chars.filter((char, index) => !/\s/.test(char) && !given[index]);
    let tiles = shuffle(letters, random);
    for (let tries = 0; tiles.join('') === letters.join('') && tries < 5; tries++) tiles = shuffle(letters, random);
    answer = { kind: 'letters', tiles, given };
  } else {
    const share = level === 4 ? Math.round(term.length / 4) : 1;
    answer = { kind: 'write', hint: term.slice(0, Math.max(1, share)) };
  }

  return { word, level, term, article, sex, clue, gender, answer };
}

/** Forgiving about case and spacing, strict about every letter. */
export function sameText(a: string, b: string): boolean {
  const normal = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return normal(a) === normal(b);
}

/** Whether the typed or picked article and word answer the exercise. */
export function isCorrect(exercise: Exercise, article: string, term: string): boolean {
  const { gender, answer } = exercise;
  const articleOk = gender === null || gender === 'shown' || sameText(article, exercise.article!);
  if (answer.kind === 'choice') {
    const expected = gender === 'shown' ? `${exercise.article} ${exercise.term}` : exercise.term;
    return articleOk && term === expected;
  }
  // Case does not count: the same letter can be a capital in one spot and not in another.
  if (answer.kind === 'letters') return articleOk && sameText(term, exercise.term.replace(/\s/g, ''));
  return articleOk && sameText(answer.hint + term, exercise.term);
}

/** The word as spelled so far: the letters given, and the placed ones in the free spots between. */
export function fillLetters(term: string, given: boolean[], placed: string[]): string {
  let next = 0;
  return [...term]
    .map((char, index) => (/\s/.test(char) ? '' : given[index] ? char : (placed[next++] ?? '')))
    .join('');
}

/** The tiles sitting in the wrong slot, once the word is complete. Case does not matter, as when checking. */
export function misplacedTiles(term: string, given: boolean[], tiles: string[], slots: (number | null)[]): number[] {
  const wanted = [...term].filter((char, index) => !/\s/.test(char) && !given[index]);
  return slots.flatMap((tile, slot) => (tile !== null && !sameText(tiles[tile]!, wanted[slot] ?? '') ? [tile] : []));
}

export function shuffle<T>(items: T[], random: Random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * The loose letter a typed character stands for, if any is left: the same
 * letter first, then the same one without its accent ("e" for "é").
 */
export function tileForTyped(tiles: string[], slots: (number | null)[], typed: string): number | null {
  const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const loose = tiles.map((_, tile) => tile).filter((tile) => !slots.includes(tile));
  const exact = loose.find((tile) => tiles[tile]!.toLowerCase() === typed.toLowerCase());
  return exact ?? loose.find((tile) => plain(tiles[tile]!) === plain(typed)) ?? null;
}

/**
 * Where every letter ends up when `tile` is dropped on slot `to`, coming from
 * slot `from` (null: from the loose letters). Letters in the way slide aside
 * into the nearest free slot, right first. Dropped on no slot (`to` null), a
 * placed letter is taken out.
 */
export function dropLetter(slots: (number | null)[], tile: number, from: number | null, to: number | null) {
  const next = [...slots];
  if (from !== null) next[from] = null;
  if (to === null) return next;
  if (next[to] !== null) {
    let free = next.indexOf(null, to);
    if (free >= 0) {
      for (let i = free; i > to; i--) next[i] = next[i - 1]!;
    } else {
      free = next.lastIndexOf(null, to);
      // A full word with nowhere to slide: nothing changes.
      if (free < 0) return [...slots];
      for (let i = free; i < to; i++) next[i] = next[i + 1]!;
    }
  }
  next[to] = tile;
  return next;
}
