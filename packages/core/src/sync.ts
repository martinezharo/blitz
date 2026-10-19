import { type Day, dayFromId, isDay } from './streak.ts';
import { LANGUAGES, MAX_LEVEL, WORD_TYPES, type Word } from './word.ts';
import type { Correction, Fix } from './writing.ts';

/**
 * What the browser and the Worker exchange. Shared by both, so the wire shape
 * has one definition.
 *
 * Conflicts resolve per word, last write wins by `updatedAt`. A deletion is a
 * change too (`word: null`), so it reaches every device.
 *
 * Sentences of the grammar history and the days practised travel the same
 * way, as changes of their own kind. Devices from before a kind existed do not
 * ask for it, and so are never sent any.
 */

/** A word as it travels: the photo is the SHA-256 of its bytes, fetched apart. */
export type WireWord = Omit<Word, 'photo' | 'photoKey'> & { photo: string | null };

/** What else than words a device can sync. */
export type ChangeKind = 'correction' | 'day';

export interface Change {
  id: string;
  updatedAt: number;
  /** Absent for a word, the one kind every device knows. */
  kind?: ChangeKind;
  /** Null when the word was deleted, and for a change of another kind. */
  word: WireWord | null;
  /** A correction's change only: null when it was deleted. */
  correction?: Correction | null;
  /** A practised day's change only. Days are never taken back. */
  day?: Day;
}

export interface SyncRequest {
  /** The highest version this device has already pulled. */
  cursor: number;
  changes: Change[];
  /** The kinds besides words this device understands. */
  kinds?: ChangeKind[];
}

export interface SyncResponse {
  cursor: number;
  changes: Change[];
  /** More changes are waiting past `cursor`; ask again. */
  more: boolean;
}

export interface Account {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** Changes a device may send in one request. */
export const MAX_PUSH = 100;
/** Changes the Worker returns in one response. */
export const MAX_PULL = 200;
/** Stored photos are small WebP or JPEG files; anything far bigger is not one of ours. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PHOTO_KEY = /^[0-9a-f]{64}$/;
const TYPES = new Set<string>(WORD_TYPES.map((type) => type.value));

const isTime = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isText = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max;
const isOptionalText = (value: unknown, max: number) => value === null || isText(value, max);

/** Validates a change from the network. Returns null when it is malformed. */
export function parseChange(value: unknown): Change | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, updatedAt, word } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !ID.test(id) || !isTime(updatedAt)) return null;
  const { kind, correction } = value as Record<string, unknown>;
  if (kind === 'correction') {
    if (correction === null) return { id, updatedAt, kind, word: null, correction: null };
    const parsed = parseCorrection(correction);
    return parsed && parsed.id === id && parsed.updatedAt === updatedAt ? { id, updatedAt, kind, word: null, correction: parsed } : null;
  }
  if (kind === 'day') {
    const { day } = value as Record<string, unknown>;
    return isDay(day) && dayFromId(id) === day ? { id, updatedAt, kind, word: null, day } : null;
  }
  if (kind !== undefined) return null;
  if (word === null) return { id, updatedAt, word: null };
  const parsed = parseWireWord(word);
  return parsed && parsed.id === id && parsed.updatedAt === updatedAt ? { id, updatedAt, word: parsed } : null;
}

function parseWireWord(value: unknown): WireWord | null {
  if (typeof value !== 'object' || value === null) return null;
  const word = value as Record<string, unknown>;
  const language = word.language;
  if (typeof language !== 'string' || !Object.hasOwn(LANGUAGES, language)) return null;
  const articles = LANGUAGES[language as Word['language']].articles;
  const valid =
    typeof word.id === 'string' &&
    typeof word.type === 'string' &&
    TYPES.has(word.type) &&
    isText(word.term, 200) &&
    (word.article === null || (typeof word.article === 'string' && !!articles?.includes(word.article))) &&
    isOptionalText(word.plural, 200) &&
    (word.counterpart === undefined || isOptionalText(word.counterpart, 200)) &&
    isOptionalText(word.translation, 500) &&
    isOptionalText(word.definition, 2000) &&
    (word.photo === null || (typeof word.photo === 'string' && PHOTO_KEY.test(word.photo))) &&
    Number.isInteger(word.level) &&
    (word.level as number) >= 0 &&
    (word.level as number) <= MAX_LEVEL &&
    (word.streak === undefined || (Number.isInteger(word.streak) && (word.streak as number) >= 0 && (word.streak as number) < 100)) &&
    (word.archived === undefined || typeof word.archived === 'boolean') &&
    isTime(word.createdAt) &&
    isTime(word.updatedAt);
  if (!valid) return null;
  // Rebuilt field by field, so nothing unexpected is stored.
  return {
    id: word.id as string,
    language: language as Word['language'],
    type: word.type as Word['type'],
    term: word.term as string,
    article: word.article as string | null,
    plural: word.plural as string | null,
    // Absent on words saved before it existed, so devices still fill it in.
    ...(word.counterpart !== undefined && { counterpart: word.counterpart as string | null }),
    translation: word.translation as string | null,
    definition: word.definition as string | null,
    photo: word.photo as string | null,
    level: word.level as number,
    streak: (word.streak as number | undefined) ?? 0,
    // Only an archived word carries the flag; absent means not archived.
    ...(word.archived === true && { archived: true }),
    createdAt: word.createdAt as number,
    updatedAt: word.updatedAt as number,
  };
}

const isSpan = (value: unknown, length: number): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((at) => Number.isInteger(at)) &&
  (value[0] as number) >= 0 &&
  (value[0] as number) <= (value[1] as number) &&
  (value[1] as number) <= length;

function parseCorrection(value: unknown): Correction | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    (item.language !== 'de' && item.language !== 'en') ||
    !isText(item.written, 2000) ||
    !isText(item.corrected, 2000) ||
    !Array.isArray(item.fixes) ||
    item.fixes.length > 40 ||
    !isTime(item.createdAt) ||
    !isTime(item.updatedAt)
  ) {
    return null;
  }
  const written = item.written as string;
  const corrected = item.corrected as string;
  const fixes: Fix[] = [];
  for (const fix of item.fixes as unknown[]) {
    if (typeof fix !== 'object' || fix === null) return null;
    const { wrong, right, why, from, to } = fix as Record<string, unknown>;
    if (!isText(wrong, 200) || typeof right !== 'string' || right.length > 200 || typeof why !== 'string' || why.length > 200) return null;
    if (!isSpan(from, written.length) || !isSpan(to, corrected.length)) return null;
    fixes.push({ wrong: wrong as string, right, why, from: [from[0], from[1]], to: [to[0], to[1]] });
  }
  return {
    id: item.id,
    language: item.language,
    written,
    corrected,
    fixes,
    createdAt: item.createdAt as number,
    updatedAt: item.updatedAt as number,
  };
}
