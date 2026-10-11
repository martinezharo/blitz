import type { Suggestion } from '../domain/dictionary.ts';
import type { Language } from '../domain/word.ts';

/** Asked for once per meaning in a session, whatever the answer. */
const asked = new Map<string, Promise<string | null>>();

const GIVE_UP_AFTER = 20_000;

/**
 * A definition written for a dictionary meaning that has none worth showing,
 * or null: nobody signed in has asked for it before, the model is busy, or
 * there is no connection. The word is only ever named, never described, so
 * the server decides what the meaning is.
 */
export function askDefinition(language: Language, suggestion: Suggestion): Promise<string | null> {
  const query = new URLSearchParams({ language, term: suggestion.term, type: suggestion.type });
  if (suggestion.article) query.set('article', suggestion.article);
  if (suggestion.translation) query.set('translation', suggestion.translation);
  // An English meaning has no translation to be told by: its dictionary definition names it.
  else if (suggestion.definition) query.set('hint', suggestion.definition);
  const key = query.toString();

  let pending = asked.get(key);
  if (!pending) {
    pending = fetch(`/api/definition?${key}`, { signal: AbortSignal.timeout(GIVE_UP_AFTER) })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { definition?: unknown };
        return typeof body.definition === 'string' ? body.definition : null;
      })
      .catch(() => null)
      .then((definition) => {
        // Asked again next time, unless it was answered.
        if (!definition) asked.delete(key);
        return definition;
      });
    asked.set(key, pending);
  }
  return pending;
}
