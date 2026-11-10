import { afterEach, describe, expect, it, vi } from 'vitest';
import { promoFunnel } from '../domain/promo.ts';
import { startPromoTracking, trackPromoStep } from './promo.ts';

// The funnel's contract and tracker are tested in @martinezharo/promo-funnel;
// these cover Blitz's own steps and its wiring.

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

function page(href: string) {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { webdriver: false });
  vi.stubGlobal('location', { href });
  vi.stubGlobal('history', { state: null, replaceState: vi.fn() });
  vi.stubGlobal('document', { documentElement: { lang: 'en' }, visibilityState: 'hidden', addEventListener: vi.fn() });
  vi.stubGlobal('addEventListener', vi.fn());
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string) as Record<string, string>);
}

const ARRIVAL = 'https://blitz.4oli.com/?utm_source=rankmaker&utm_medium=promo&utm_content=home&utm_term=short-1&promo_lang=es';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('promoFunnel', () => {
  it('counts the visit, then opening the app, signing in, adding a word and playing', () => {
    expect(promoFunnel.promo).toBe('blitz');
    expect(promoFunnel.steps).toEqual(['arrive', 'stay-10s', 'stay-1m', 'stay-3m', 'open-app', 'sign-in', 'add-word', 'start-game']);
  });
});

describe('the page', () => {
  it('reports the arrival and each step once, as Blitz', () => {
    const sent = page(ARRIVAL);
    startPromoTracking();
    trackPromoStep('add-word');
    trackPromoStep('add-word');
    expect(sent()).toEqual([
      { event: 'arrive', promo: 'blitz', source: 'rankmaker', placement: 'home', locale: 'es', variant: 'short-1' },
      { event: 'add-word', promo: 'blitz', source: 'rankmaker', placement: 'home', locale: 'es', variant: 'short-1' },
    ]);
  });

  it('counts one arrival when the same link loads twice within seconds (installed-app redirect)', () => {
    vi.useFakeTimers();
    const sent = page(ARRIVAL);
    startPromoTracking();
    vi.advanceTimersByTime(2_000);
    startPromoTracking();
    expect(sent().filter((event) => event.event === 'arrive')).toHaveLength(1);
  });

  it('sends nothing without an arrival, or from an automated browser', () => {
    const sent = page('https://blitz.4oli.com/learn');
    startPromoTracking();
    trackPromoStep('open-app');
    expect(sent()).toEqual([]);

    const automated = page(ARRIVAL);
    vi.stubGlobal('navigator', { webdriver: true });
    startPromoTracking();
    expect(automated()).toEqual([]);
  });
});
