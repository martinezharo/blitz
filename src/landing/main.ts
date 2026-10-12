import '@fontsource-variable/nunito';
import '../styles/global.css';
import './landing.css';
import type { ListSummary, ListTint } from '../domain/lists.ts';
import { startLesson } from './lesson.ts';

/**
 * The front page. Its words are static HTML; this only brings in the two
 * things that move: the lesson in the hero and the ready-made lists, read from
 * the same index the app uses, so the page never names a list that is gone.
 */

startLesson(document.getElementById('lesson')!);

/** The same colours the app gives each tint (src/features/lists/list-look.tsx). */
const COLOUR: Record<ListTint, string> = { orange: 'accent', red: 'die', blue: 'der', green: 'das' };

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

async function showLists(grid: HTMLElement) {
  const response = await fetch('/lists/index.json');
  if (!response.ok) return;
  const lists = (await response.json()) as ListSummary[];
  grid.replaceChildren(
    ...lists.map((list) => {
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
    }),
  );
}

// Without the lists the section has nothing to show, so it steps aside.
const grid = document.getElementById('list-grid')!;
showLists(grid).catch(() => {}).finally(() => {
  if (grid.childElementCount === 0) grid.closest('section')!.hidden = true;
});
