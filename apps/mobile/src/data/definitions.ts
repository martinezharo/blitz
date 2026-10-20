import type { Suggestion } from '@blitz/core/dictionary.ts';
import type { Language } from '@blitz/core/word.ts';
import { api } from './api.ts';

/** Asked for once per meaning in a session, unless the failure may pass. */
const asked = new Map<string, Promise<string | null>>();

const GIVE_UP_AFTER = 20_000;

/**
 * A definition written for a dictionary meaning that has none worth showing,
 * or null. The word is only ever named, never described, so the server decides
 * what the meaning is.
 */
export function askDefinition(language: Language, suggestion: Suggestion): Promise<string | null> {
  const query = new URLSearchParams({ language, term: suggestion.term, type: suggestion.type });
  if (suggestion.article) query.set('article', suggestion.article);
  if (suggestion.translation) query.set('translation', suggestion.translation);
  else if (suggestion.definition) query.set('hint', suggestion.definition);
  const key = query.toString();

  let pending = asked.get(key);
  if (!pending) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GIVE_UP_AFTER);
    pending = api(`/api/definition?${key}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return { definition: null, final: [401, 403, 404, 429].includes(response.status) };
        const body = (await response.json()) as { definition?: unknown };
        return { definition: typeof body.definition === 'string' ? body.definition : null, final: true };
      })
      .catch(() => ({ definition: null, final: false }))
      .then(({ definition, final }) => {
        clearTimeout(timer);
        if (!final) asked.delete(key);
        return definition;
      });
    asked.set(key, pending);
  }
  return pending;
}
