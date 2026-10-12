import { sameText, shuffle } from '../domain/practice.ts';

/**
 * The hero's lesson: one word, asked the way each of the five levels asks it
 * (src/domain/practice.ts). A right answer climbs a level, so a visitor sees
 * all five in a minute; a wrong one drops a level, as in the app.
 */

const WORD = { article: 'der', term: 'Regenschirm', translation: 'umbrella', definition: 'A folding cover held overhead to keep off rain' };
const ARTICLES = ['der', 'die', 'das'];
const TOP = 5;

type Clue = 'photo' | 'translation' | 'definition';

interface Level {
  question: string;
  clue: Clue;
  build(answer: HTMLElement, ready: (complete: boolean) => void): () => { article: string; term: string };
}

/** Builds an element from a tag, its attributes and its children. */
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

/** A row of buttons of which one at a time is pressed. */
function pickOne(container: HTMLElement, buttons: HTMLButtonElement[], onPick: (value: string) => void) {
  for (const button of buttons) {
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      onPick(button.dataset.value!);
    });
    container.append(button);
  }
}

function articlePicker(answer: HTMLElement, onPick: (article: string) => void) {
  const row = h('div', { class: 'articles-row', role: 'group', 'aria-label': 'Article' });
  pickOne(
    row,
    ARTICLES.map((article) => h('button', { class: 'article', 'data-article': article, 'data-value': article }, article) as HTMLButtonElement),
    onPick,
  );
  answer.append(row);
}

function choices(count: number, withArticle: boolean): Level['build'] {
  const pool = ['Bildschirm', 'Sonnenschirm', 'Regenjacke', 'Regenbogen', 'Fallschirm', 'Regentropfen', 'Schirmmütze'];
  const gender: Record<string, string> = { Regenjacke: 'die', Schirmmütze: 'die' };
  return (answer, ready) => {
    let article = withArticle ? WORD.article : '';
    let term = '';
    const update = () => ready(term !== '' && article !== '');
    if (!withArticle) articlePicker(answer, (picked) => ((article = picked), update()));
    const terms = shuffle([WORD.term, ...pool.slice(0, count - 1)]);
    const list = h('div', { class: 'options', role: 'group', 'aria-label': 'Options', ...(count > 4 ? { 'data-many': '' } : {}) });
    pickOne(
      list,
      terms.map((option) => {
        const shown = withArticle ? [h('b', { 'data-article': gender[option] ?? 'der' }, gender[option] ?? 'der'), ` ${option}`] : [option];
        return h('button', { class: 'option', 'data-value': option }, ...shown) as HTMLButtonElement;
      }),
      (picked) => ((term = picked), update()),
    );
    answer.append(list);
    return () => ({ article, term });
  };
}

/** Level 3: a third of the letters in place, the rest to tap into the free slots in order. */
const letters: Level['build'] = (answer, ready) => {
  let article = '';
  articlePicker(answer, (picked) => ((article = picked), update()));
  const chars = [...WORD.term];
  const given = chars.map((_, index) => index === 1 || index === 5 || index === 9 || index === 10);
  const free = chars.filter((_, index) => !given[index]);
  let order = shuffle(free.map((_, index) => index));
  while (order.every((value, index) => value === index)) order = shuffle(order);
  const placed: (number | null)[] = free.map(() => null);

  const slots = h('div', { class: 'slots', 'aria-label': 'The word so far', style: `--letters: ${chars.length}` });
  const tiles = h('div', { class: 'tiles', role: 'group', 'aria-label': 'Letters' });
  const update = () => ready(article !== '' && placed.every((tile) => tile !== null));

  function render() {
    slots.replaceChildren(
      ...chars.map((char, index) => {
        if (given[index]) return h('span', { class: 'slot', 'data-given': '' }, char);
        const slot = chars.slice(0, index).filter((_, before) => !given[before]).length;
        const tile = placed[slot];
        return h('span', { class: 'slot', ...(tile !== null && tile !== undefined ? { 'data-filled': '' } : {}) }, tile == null ? '' : free[tile]!);
      }),
    );
    tiles.replaceChildren(
      ...order.map((tile) => {
        const used = placed.includes(tile);
        const button = h('button', { class: 'tile', type: 'button', 'aria-label': `Letter ${free[tile]}` }, free[tile]!) as HTMLButtonElement;
        button.disabled = used;
        button.addEventListener('click', () => {
          placed[placed.indexOf(null)] = tile;
          render();
          update();
        });
        return button;
      }),
    );
  }
  render();
  const undo = h('button', { class: 'undo', type: 'button' }, icon('rotate-ccw'), 'Take the last one back');
  undo.addEventListener('click', () => {
    const next = placed.indexOf(null);
    const last = (next < 0 ? placed.length : next) - 1;
    if (last >= 0) placed[last] = null;
    render();
    update();
  });
  answer.append(slots, tiles, undo);
  return () => {
    let next = 0;
    return { article, term: chars.map((char, index) => (given[index] ? char : free[placed[next++]!])).join('') };
  };
};

/** Levels 4 and 5: the article and the word written out, after the letters given. */
function written(hint: string): Level['build'] {
  return (answer, ready) => {
    const article = h('input', { class: 'field article-field', 'aria-label': 'Article', placeholder: 'article', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const term = h('input', { 'aria-label': `The word, after ${hint}`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const update = () => ready(article.value.trim() !== '' && term.value.trim() !== '');
    article.addEventListener('input', update);
    term.addEventListener('input', update);
    answer.append(h('div', { class: 'write' }, article, h('label', { class: 'field' }, h('span', { class: 'hint' }, hint), term)));
    return () => ({ article: article.value, term: hint + term.value });
  };
}

const LEVELS: Level[] = [
  { question: 'Which word is it?', clue: 'photo', build: choices(4, true) },
  { question: 'Which word is it, with its article?', clue: 'translation', build: choices(8, false) },
  { question: 'Spell it, with its article.', clue: 'photo', build: letters },
  { question: 'Write it, with its article.', clue: 'translation', build: written(WORD.term.slice(0, 3)) },
  { question: 'Write it, with its article.', clue: 'definition', build: written(WORD.term.slice(0, 1)) },
];

function clue(kind: Clue): HTMLElement {
  if (kind === 'photo') return h('div', { class: 'clue-photo', role: 'img', 'aria-label': 'A picture of an umbrella' }, icon('umbrella'));
  if (kind === 'translation') return h('p', { class: 'clue-text' }, h('small', {}, 'In English'), WORD.translation);
  return h('p', { class: 'clue-text clue-definition' }, h('small', {}, 'Meaning'), WORD.definition);
}

export function startLesson(root: HTMLElement) {
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const [question, clueBox, answer, foot, feedback, check, levelName] = ['question', 'clue', 'answer', 'foot', 'feedback', 'check', 'level-name'].map($) as [
    HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLButtonElement, HTMLElement,
  ];
  let level = 1;
  let read: () => { article: string; term: string } = () => ({ article: '', term: '' });
  let state: 'asking' | 'answered' | 'learned' = 'asking';

  function ask() {
    state = 'asking';
    const step = LEVELS[level - 1]!;
    root.dataset.level = String(level);
    delete foot.dataset.result;
    levelName.textContent = `Level ${level}`;
    question.textContent = step.question;
    clueBox.replaceChildren(clue(step.clue));
    answer.replaceChildren();
    feedback.replaceChildren();
    check.textContent = 'Check';
    check.disabled = true;
    read = step.build(answer, (complete) => (check.disabled = !complete));
  }

  function learned() {
    state = 'learned';
    root.dataset.level = 'learned';
    delete foot.dataset.result;
    levelName.textContent = 'Learned';
    question.textContent = 'der Regenschirm is yours.';
    clueBox.replaceChildren();
    answer.replaceChildren(
      h('p', { class: 'learned' }, 'From picking it out of four to writing it from one letter. Now imagine that with every word you looked up this month.'),
    );
    feedback.replaceChildren();
    check.replaceChildren(icon('rotate-ccw'), 'Again');
    check.disabled = false;
  }

  function judge() {
    const { article, term } = read();
    const right = sameText(article, WORD.article) && sameText(term, WORD.term);
    state = 'answered';
    foot.dataset.result = right ? 'right' : 'wrong';
    for (const control of answer.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) control.disabled = true;
    const said = h('span', {}, h('strong', {}, right ? (level === TOP ? 'Perfect!' : 'Right!') : 'Not quite'), h('span', {}, `${WORD.article} ${WORD.term}`));
    feedback.replaceChildren(h('span', { class: 'mark' }, icon(right ? 'check' : 'x')), said);
    // Mirrors the real rule: a miss costs a level, never below the first.
    const next = right ? level + 1 : Math.max(1, level - 1);
    root.dataset.level = String(Math.min(next, TOP));
    levelName.textContent = right ? (level === TOP ? 'Learned' : `Up to level ${next}`) : level === 1 ? 'Level 1' : `Down to level ${next}`;
    level = next;
    check.textContent = 'Continue';
    check.focus();
  }

  check.addEventListener('click', () => {
    if (state === 'asking') judge();
    else if (state === 'answered') level > TOP ? learned() : ask();
    else {
      level = 1;
      ask();
    }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || check.disabled) return;
    // Otherwise the same press, landing on the focused button, would skip past the answer.
    event.preventDefault();
    check.click();
  });
  ask();
}
