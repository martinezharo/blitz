import { lookup } from '../data/dictionary.ts';
import { fillDraft, type Suggestion, suggestionTitle } from '../domain/dictionary.ts';
import { emptyDraft, LANGUAGES, type Language } from '../domain/word.ts';

/**
 * The app's composer, working: type a word, get what the dictionary has for
 * it, and add it. Added words go where the app keeps them (this browser's
 * IndexedDB), so they are waiting in Blitz. The storage code only loads on the
 * first add, which keeps the page itself light.
 */

const LANGUAGE_KEY = 'blitz.language';
const SHOWN = 3;
/** A word half typed in each language, so the composer shows what it does before anyone types. */
const STARTERS: Record<Language, string> = { de: 'Schmett', en: 'wande' };

function h(tag: string, attributes: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    if (value && value in LANGUAGES) return value as Language;
  } catch {
    // Storage can be blocked; German, as in the app.
  }
  return 'de';
}

/** The word as a row of the app's list, title first. */
function wordRow(language: Language, suggestion: Suggestion, ...end: Node[]): Node[] {
  const article = LANGUAGES[language].articles ? suggestion.article : null;
  const title = h('span', { class: 'term' }, ...(article ? [h('b', {}, article), ' '] : []), suggestion.term, ' ', h('small', {}, suggestion.type));
  const meaning = [suggestion.translation, suggestion.plural && `pl. ${suggestion.plural}`].filter(Boolean).join(' · ');
  return [
    h('span', { class: 'thumb' }, [...suggestion.term][0]!.toUpperCase()),
    h(
      'span',
      { class: 'suggestion-text' },
      title,
      ...(meaning ? [h('span', { class: 'meta' }, meaning)] : []),
      ...(suggestion.definition ? [h('span', { class: 'meta definition' }, suggestion.definition)] : []),
    ),
    ...end,
  ];
}

export function startComposer(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('#composer-input')!;
  const list = root.querySelector<HTMLElement>('#suggestions')!;
  const status = root.querySelector<HTMLElement>('#composer-status')!;
  const mine = root.querySelector<HTMLElement>('#mine')!;
  const mineList = root.querySelector<HTMLElement>('#mine-list')!;
  const switches = [...root.querySelectorAll<HTMLButtonElement>('button[data-language]')];
  let language = storedLanguage();
  let asked = 0;
  const added = new Set<string>();

  function showLanguage() {
    for (const button of switches) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    // The pill slides under the language picked, as the app's Words / Write switch does.
    root.querySelector<HTMLElement>('.switch')!.dataset.language = language;
    input.placeholder = `Add ${language === 'en' ? 'an' : 'a'} ${LANGUAGES[language].name} word`;
    input.lang = language;
  }

  async function search() {
    const typed = input.value;
    const ask = ++asked;
    // What it finds belongs to this language, even if the switch moves on meanwhile.
    const searched = language;
    const found = typed.trim() ? await lookup(searched, typed) : [];
    // A slower answer to an older keystroke changes nothing.
    if (ask !== asked) return;
    list.replaceChildren(
      ...found.slice(0, SHOWN).map((suggestion) => {
        const key = `${searched}|${suggestion.article}|${suggestion.term}|${suggestion.translation ?? suggestion.definition}`;
        const done = added.has(key);
        const button = h(
          'button',
          { type: 'button', class: 'suggestion', 'data-article': suggestion.article ?? '', 'aria-label': `Add ${suggestionTitle(searched, suggestion)}` },
          ...wordRow(searched, suggestion, h('span', { class: 'suggestion-add' }, icon(done ? 'check' : 'plus'))),
        ) as HTMLButtonElement;
        button.disabled = done;
        button.addEventListener('click', () => void add(searched, suggestion, key, button));
        return h('li', {}, button);
      }),
    );
    status.textContent =
      typed.trim().length < 2 ? '' : found.length === 0 ? `Nothing for “${typed.trim()}” in the dictionary. In Blitz you can add it with your own meaning.` : '';
  }

  async function add(language: Language, suggestion: Suggestion, key: string, button: HTMLButtonElement) {
    button.disabled = true;
    try {
      const { addWord } = await import('../data/words.ts');
      await addWord(language, fillDraft(language, emptyDraft(suggestion.term), suggestion));
      // The app opens on the language of the words just added.
      try {
        localStorage.setItem(LANGUAGE_KEY, language);
      } catch {
        // Then the app opens on whatever it had.
      }
    } catch {
      button.disabled = false;
      status.textContent = "This browser couldn't keep the word. Add it in Blitz instead.";
      return;
    }
    added.add(key);
    button.querySelector('.suggestion-add')!.replaceChildren(icon('check'));
    const bars = h('span', { class: 'level', 'data-on': '1', 'aria-label': 'Level 1 of 5' }, ...Array.from({ length: 5 }, () => h('i')));
    mineList.prepend(h('li', { 'data-article': LANGUAGES[language].articles ? (suggestion.article ?? '') : '' }, ...wordRow(language, suggestion, bars)));
    mine.hidden = false;
    root.querySelector('#mine-count')!.textContent = mineList.childElementCount === 1 ? '1 word is' : `${mineList.childElementCount} words are`;
  }

  for (const button of switches) {
    button.addEventListener('click', () => {
      const from = language;
      language = button.dataset.language as Language;
      if (language === from) return;
      // The other language's starter word means nothing here: this one's takes its place.
      if (!input.value.trim() || input.value === STARTERS[from]) input.value = STARTERS[language];
      showLanguage();
      list.replaceChildren();
      void search();
      input.focus();
    });
  }
  input.addEventListener('input', () => void search());
  showLanguage();

  // The dictionary is fetched once the composer is close, with a word already
  // half typed so it shows what it does before anyone types.
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      if (!input.value) input.value = STARTERS[language];
      void search();
    },
    { rootMargin: '400px' },
  );
  near.observe(root);
}
