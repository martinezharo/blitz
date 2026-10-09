import { LANGUAGES, MAX_LEVEL, WORD_TYPES, type Word } from './word.ts';

/**
 * What the browser and the Worker exchange. Shared by both, so the wire shape
 * has one definition.
 *
 * Conflicts resolve per word, last write wins by `updatedAt`. A deletion is a
 * change too (`word: null`), so it reaches every device.
 */

/** A word as it travels: the photo is the SHA-256 of its bytes, fetched apart. */
export type WireWord = Omit<Word, 'photo' | 'photoKey'> & { photo: string | null };

export interface Change {
  id: string;
  updatedAt: number;
  /** Null when the word was deleted. */
  word: WireWord | null;
}

export interface SyncRequest {
  /** The highest version this device has already pulled. */
  cursor: number;
  changes: Change[];
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
/** Stored photos are small JPEGs; anything far bigger is not one of ours. */
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
