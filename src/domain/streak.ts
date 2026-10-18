/**
 * The practice streak: how many days in a row at least one question was
 * answered, in any language. A day is the calendar day where it was answered,
 * `YYYY-MM-DD`, so the streak follows the clock of the device in hand.
 *
 * Days sync like words, one change per day. Their id is made from the date, so
 * two devices practising on the same day write the same row and never count
 * it twice.
 */

export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_ID = /^da7e0000-0000-4000-8000-0000(\d{4})(\d{2})(\d{2})$/;

/** The calendar day of a moment, where this device is. */
export function dayOf(time: number): Day {
  const date = new Date(time);
  const two = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function isDay(value: unknown): value is Day {
  if (typeof value !== 'string') return false;
  const match = DAY.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The day `count` days after (or, negative, before) another. Counted in UTC, so no clock change skips one. */
export function addDays(day: Day, count: number): Day {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

/** The id a day travels under: shaped like the ids of words, and the same on every device. */
export function dayId(day: Day): string {
  return `da7e0000-0000-4000-8000-0000${day.replaceAll('-', '')}`;
}

export function dayFromId(id: string): Day | null {
  const match = DAY_ID.exec(id);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  return isDay(day) ? day : null;
}

export interface Streak {
  /** Days in a row, up to today, or up to yesterday while today is still open. */
  count: number;
  /** Today has been practised already. */
  today: boolean;
  /** The longest run there has ever been. */
  best: number;
}

export function streakOf(days: Iterable<Day>, today: Day): Streak {
  const practised = new Set(days);
  const done = practised.has(today);
  let count = 0;
  for (let day = done ? today : addDays(today, -1); practised.has(day); day = addDays(day, -1)) count++;

  let best = 0;
  for (const day of practised) {
    // Only the first day of each run counts it out.
    if (practised.has(addDays(day, -1))) continue;
    let run = 1;
    while (practised.has(addDays(day, run))) run++;
    best = Math.max(best, run);
  }
  return { count, today: done, best };
}

/** The last seven days, oldest first, and whether each was practised. */
export function weekOf(days: Iterable<Day>, today: Day): { day: Day; practised: boolean }[] {
  const practised = new Set(days);
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6);
    return { day, practised: practised.has(day) };
  });
}
