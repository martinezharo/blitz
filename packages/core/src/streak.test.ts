import { describe, expect, it } from 'vitest';
import { addDays, dayFromId, dayId, dayOf, isDay, streakOf, weekOf } from './streak.ts';

describe('days', () => {
  it('reads the calendar day where the device is', () => {
    expect(dayOf(new Date(2026, 9, 19, 23, 59).getTime())).toBe('2026-10-19');
    expect(dayOf(new Date(2026, 0, 1, 0, 0).getTime())).toBe('2026-01-01');
  });

  it('counts across months, years and clock changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('only takes real dates', () => {
    expect(isDay('2026-10-19')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-1-9')).toBe(false);
    expect(isDay(20261019)).toBe(false);
  });

  it('travels under an id made from the date', () => {
    const id = dayId('2026-10-19');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(dayFromId(id)).toBe('2026-10-19');
    expect(dayFromId(crypto.randomUUID())).toBeNull();
  });
});

describe('streakOf', () => {
  const today = '2026-10-19';

  it('is nothing without practice', () => {
    expect(streakOf([], today)).toEqual({ count: 0, today: false, best: 0 });
  });

  it('counts the days in a row up to today', () => {
    expect(streakOf(['2026-10-17', '2026-10-18', '2026-10-19'], today)).toEqual({ count: 3, today: true, best: 3 });
  });

  it('keeps yesterday’s streak alive while today is still open', () => {
    expect(streakOf(['2026-10-17', '2026-10-18'], today)).toEqual({ count: 2, today: false, best: 2 });
  });

  it('is broken by a day missed', () => {
    expect(streakOf(['2026-10-15', '2026-10-16', '2026-10-17'], today)).toEqual({ count: 0, today: false, best: 3 });
    expect(streakOf(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-18', '2026-10-19'], today)).toEqual({ count: 2, today: true, best: 3 });
  });
});

describe('weekOf', () => {
  it('lists the last seven days, oldest first', () => {
    const week = weekOf(['2026-10-13', '2026-10-19', '2026-10-01'], '2026-10-19');
    expect(week.map((entry) => entry.day)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
    expect(week.filter((entry) => entry.practised).map((entry) => entry.day)).toEqual(['2026-10-13', '2026-10-19']);
  });
});
