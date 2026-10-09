import { MAX_LEVEL, type Word } from './word.ts';

/**
 * How practice works. Each word climbs five levels, each one a harder kind of
 * question. Three right answers in a row move a word up; one wrong answer
 * moves it down. Past the top level a word keeps coming back, and a single
 * miss drops it to level four again.
 */

const LESSON_SIZE = 10;
/** Right answers in a row that move a word up a level. */
const STREAK_TO_LEVEL_UP = 3;

type Random = () => number;

/** Words from before practice existed were stored at level 0. */
export function levelOf(word: Pick<Word, 'level'>): number {
  return Math.min(MAX_LEVEL, Math.max(1, word.level));
}

export function progress(word: Pick<Word, 'level' | 'streak'>, correct: boolean): { level: number; streak: number } {
  const level = levelOf(word);
  if (!correct) return { level: Math.max(1, level - 1), streak: 0 };
  const streak = (word.streak ?? 0) + 1;
  if (streak >= STREAK_TO_LEVEL_UP && level < MAX_LEVEL) return { level: level + 1, streak: 0 };
  return { level, streak: level < MAX_LEVEL ? streak : 0 };
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
  | { kind: 'letters'; tiles: string[] }
  | { kind: 'write'; hint: string };

export interface Exercise {
  word: Word;
  level: number;
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

  const gender: Gender = !word.article ? null : level === 1 ? 'shown' : level <= 3 ? 'pick' : 'write';

  let answer: Answer;
  if (level <= 2) {
    const label = (other: Word) => (gender === 'shown' && other.article ? `${other.article} ${other.term}` : other.term);
    const correct = label(word);
    // Same kind of word first, so the wrong options are not giveaways.
    const others = shuffle(words.filter((other) => other.id !== word.id), random).sort(
      (a, b) => Number(b.type === word.type) - Number(a.type === word.type),
    );
    const options = new Set([correct]);
    for (const other of others) {
      if (options.size >= CHOICES[level]!) break;
      options.add(label(other));
    }
    answer = { kind: 'choice', options: shuffle([...options], random) };
  } else if (level === 3) {
    const letters = [...word.term.replace(/\s/g, '')];
    let tiles = shuffle(letters, random);
    for (let tries = 0; tiles.join('') === letters.join('') && tries < 5; tries++) tiles = shuffle(letters, random);
    answer = { kind: 'letters', tiles };
  } else {
    const share = level === 4 ? Math.round(word.term.length / 4) : 1;
    answer = { kind: 'write', hint: word.term.slice(0, Math.max(1, share)) };
  }

  return { word, level, clue, gender, answer };
}

/** Forgiving about case and spacing, strict about every letter. */
export function sameText(a: string, b: string): boolean {
  const normal = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return normal(a) === normal(b);
}

/** Whether the typed or picked article and word answer the exercise. */
export function isCorrect(exercise: Exercise, article: string, term: string): boolean {
  const { word, gender, answer } = exercise;
  const articleOk = gender === null || gender === 'shown' || sameText(article, word.article!);
  if (answer.kind === 'choice') {
    const expected = gender === 'shown' ? `${word.article} ${word.term}` : word.term;
    return articleOk && term === expected;
  }
  if (answer.kind === 'letters') return articleOk && term === word.term.replace(/\s/g, '');
  return articleOk && sameText(answer.hint + term, word.term);
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
