import '@fontsource-variable/nunito';
import '../styles/global.css';
import './landing.css';
import type { ListSummary, ListTint } from '../domain/lists.ts';
import { shuffle } from '../domain/practice.ts';
import { followUpdates } from '../shared/app-update.ts';
import { startComposer } from './composer.ts';
import { startLesson } from './lesson.ts';

/**
 * The front page. Its words are static HTML; this brings in what moves: the
 * lesson in the hero, the working composer, and the ready-made lists, read
 * from the same index the app uses, so the page never names a list that is gone.
 */

startLesson(document.getElementById('lesson')!);
// The front page does not install the service worker, but follows a new build
// when one installed by the app has taken over.
if (import.meta.env.PROD) followUpdates();
startComposer(document.getElementById('composer')!);

/** The same colours the app gives each tint (src/features/lists/list-look.tsx). */
const COLOUR: Record<ListTint, string> = { orange: 'accent', red: 'die', blue: 'der', green: 'das' };
/** Phones get a handful, picked at random, rather than a long scroll of cards. */
const ON_PHONES = 8;

function listIcon(nodes: unknown[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributes] of nodes as [string, Record<string, string>][]) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) if (name !== 'key') element.setAttribute(name, value);
    svg.append(element);
  }
  return svg;
}

function listCard(list: ListSummary): HTMLLIElement {
  const item = document.createElement('li');
  item.style.setProperty('--tint', `var(--${COLOUR[list.tint]})`);
  const name = document.createElement('strong');
  name.textContent = list.name;
  const sample = document.createElement('span');
  sample.textContent = `${list.de.sample.join(', ')}…`;
  const count = document.createElement('small');
  count.textContent = `${list.de.count} words`;
  item.append(name, sample, count, listIcon(list.icon));
  return item;
}

/**
 * Only whole rows, so no card is left on its own at the end: as many as fill
 * the columns there are, and on phones a random few.
 */
function fitRows(grid: HTMLElement, cards: HTMLLIElement[], phoneOrder: HTMLLIElement[], more: HTMLAnchorElement) {
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const phone = columns <= 2;
  const order = phone ? phoneOrder : cards;
  const shown = phone ? Math.min(ON_PHONES, cards.length) : cards.length - (cards.length % columns) || cards.length;
  grid.replaceChildren(...order.slice(0, shown));
  more.hidden = shown === cards.length;
  more.textContent = `See all ${cards.length} lists in Blitz`;
}

async function showLists(grid: HTMLElement, more: HTMLAnchorElement) {
  const response = await fetch('/lists/index.json');
  if (!response.ok) return;
  const cards = ((await response.json()) as ListSummary[]).map(listCard);
  if (cards.length === 0) return;
  const phoneOrder = shuffle(cards);
  // The number of columns changes with the width, and so does what fills them.
  let width = -1;
  new ResizeObserver(([entry]) => {
    if (entry!.contentRect.width === width) return;
    width = entry!.contentRect.width;
    fitRows(grid, cards, phoneOrder, more);
  }).observe(grid);
  fitRows(grid, cards, phoneOrder, more);
}

// Without the lists the section has nothing to show, so it steps aside.
const grid = document.getElementById('list-grid')!;
showLists(grid, document.getElementById('more-lists') as HTMLAnchorElement)
  .catch(() => {})
  .finally(() => {
    if (grid.childElementCount === 0) grid.closest('section')!.hidden = true;
  });
