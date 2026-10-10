import { DICT_KINDS, type DictEntry, type DictKind, MIN_QUERY, normalize, shardKey, type Suggestion, suggest } from '../domain/dictionary.ts';
import type { Language } from '../domain/word.ts';

const shards = new Map<string, Promise<DictEntry[]>>();

/**
 * One file of the dictionary. A missing file, or one that is not JSON (the app
 * answers unknown paths with its own page), is an empty one: no word there.
 * A network failure is not remembered, so the next keystroke tries again.
 */
function shard(kind: DictKind, key: string): Promise<DictEntry[]> {
  const id = `${kind}/${key}`;
  let loading = shards.get(id);
  if (!loading) {
    loading = fetch(`/dict/${id}.json`)
      .then(async (response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('json')) return [];
        return (await response.json()) as DictEntry[];
      })
      .catch(() => {
        shards.delete(id);
        return [];
      });
    shards.set(id, loading);
  }
  return loading;
}

/**
 * Words of the language that start like `typed`, or whose English translation
 * does, best first. Nothing until there are enough letters to go on.
 */
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
