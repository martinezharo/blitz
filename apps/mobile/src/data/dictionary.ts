import { Directory, File, Paths } from 'expo-file-system';
import {
  DICT_KINDS,
  type DictEntry,
  type DictKind,
  MIN_QUERY,
  normalize,
  shardKey,
  type Suggestion,
  suggest,
  wordOfPlural,
} from '@blitz/core/dictionary.ts';
import type { Language } from '@blitz/core/word.ts';
import { API } from './api.ts';

/**
 * The dictionary is static JSON made at build time and split by the first two
 * letters of the word, so typing only ever downloads one or two files.
 *
 * On a device each shard is kept on disk after the first look, so a word
 * looked up once is there for good, offline included.
 */

const shards = new Map<string, Promise<DictEntry[]>>();
const dir = new Directory(Paths.cache, 'dict');

function shard(kind: DictKind, key: string): Promise<DictEntry[]> {
  const id = `${kind}/${key}`;
  let loading = shards.get(id);
  if (!loading) {
    loading = (async () => {
      const file = new File(dir, `${kind}-${key}.json`);
      if (file.exists) {
        try {
          return JSON.parse(await file.text()) as DictEntry[];
        } catch {
          // A half-written file is made again below.
        }
      }
      try {
        const response = await fetch(`${API}/dict/${id}.json`);
        if (!response.ok) return [];
        const text = await response.text();
        if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
        try {
          file.writeSync(text);
        } catch {
          // Read-only cache: the answer is still good for this session.
        }
        return JSON.parse(text) as DictEntry[];
      } catch {
        shards.delete(id);
        return [];
      }
    })();
    shards.set(id, loading);
  }
  return loading;
}

/** Words of the language that start like `typed`, or whose English translation does. */
export async function lookup(language: Language, typed: string): Promise<Suggestion[]> {
  const query = normalize(typed);
  if (query.length < MIN_QUERY) return [];
  const key = shardKey(query);
  return suggest(typed, await Promise.all(DICT_KINDS[language].map((kind) => shard(kind, key))));
}

/** The dictionary's first entry for exactly this word, or null. */
export async function lookupWord(language: Language, term: string): Promise<Suggestion | null> {
  const query = normalize(term);
  const found = await lookup(language, term);
  return found.find((suggestion) => !suggestion.translated && normalize(suggestion.term) === query) ?? null;
}

/**
 * The dictionary's entry for a word as it was used in a text: the word itself,
 * or failing that the word it is the plural of.
 */
export async function lookupForm(language: Language, form: string): Promise<Suggestion | null> {
  const exact = await lookupWord(language, form);
  if (exact) return exact;
  const query = normalize(form);
  if (query.length < MIN_QUERY) return null;
  return wordOfPlural(form, await shard(DICT_KINDS[language][0]!, shardKey(query)));
}
