import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePromoEvent } from '../domain/promo.ts';
import { PROMO_ATTRIBUTION_TTL_MS, type PromoAttribution, parsePromoArrival, parseStoredAttribution, startPromoTracking, stripPromoParams, trackPromoStep } from './promo.ts';

const NOW = 1_800_000_000_000;

const arrival = (query: string, pageLang = 'en') => parsePromoArrival(new URL(`https://blitz.4oli.com/${query}`), pageLang, NOW);

describe('parsePromoArrival', () => {
  it('reads a full promo link', () => {
    expect(arrival('?utm_source=rankmaker&utm_medium=promo&utm_content=end-card&utm_term=short-1&promo_lang=es')).toEqual({
      promo: 'blitz',
      source: 'rankmaker',
      placement: 'end-card',
      locale: 'es',
      variant: 'short-1',
      at: NOW,
      sent: [],
    });
  });

  it("falls back to the page's base language and an empty variant", () => {
    expect(arrival('?utm_source=backrooms&utm_medium=promo&utm_content=menu&utm_term=Bad_Term&promo_lang=spanish', 'pt-BR')).toMatchObject({
      locale: 'pt',
      variant: '',
    });
  });

  it('ignores links that are not a promo for a known source', () => {
    expect(arrival('?utm_source=rankmaker&utm_medium=email&utm_content=x')).toBeNull();
    expect(arrival('?utm_source=elsewhere&utm_medium=promo&utm_content=x')).toBeNull();
    expect(arrival('?utm_source=rankmaker&utm_medium=promo')).toBeNull();
    expect(arrival('?utm_source=rankmaker&utm_medium=promo&utm_content=-bad')).toBeNull();
    expect(arrival(`?utm_source=rankmaker&utm_medium=promo&utm_content=${'a'.repeat(33)}`)).toBeNull();
    expect(arrival('')).toBeNull();
  });
});

describe('stripPromoParams', () => {
  it('removes only the promo parameters, keeping the rest and the hash', () => {
    const url = new URL('https://blitz.4oli.com/learn?a=1&utm_source=rankmaker&utm_medium=promo&utm_content=x&utm_term=y&promo_lang=es&b=2#top');
    expect(stripPromoParams(url)).toBe('/learn?a=1&b=2#top');
  });

  it('leaves no dangling question mark', () => {
    expect(stripPromoParams(new URL('https://blitz.4oli.com/?utm_source=backrooms&utm_medium=promo#lists'))).toBe('/#lists');
  });
});

describe('parseStoredAttribution', () => {
  const stored: PromoAttribution = { promo: 'blitz', source: 'backrooms', placement: 'menu', locale: 'en', variant: '', at: NOW, sent: ['arrive'] };

  it('accepts a well-formed attribution within its seven days', () => {
    expect(parseStoredAttribution(JSON.stringify(stored), NOW + PROMO_ATTRIBUTION_TTL_MS)).toEqual(stored);
  });

  it('expires after seven days', () => {
    expect(parseStoredAttribution(JSON.stringify(stored), NOW + PROMO_ATTRIBUTION_TTL_MS + 1)).toBeNull();
  });

  it('rejects anything malformed', () => {
    expect(parseStoredAttribution(null, NOW)).toBeNull();
    expect(parseStoredAttribution('{', NOW)).toBeNull();
    expect(parseStoredAttribution(JSON.stringify({ ...stored, promo: 'other' }), NOW)).toBeNull();
    expect(parseStoredAttribution(JSON.stringify({ ...stored, sent: 'arrive' }), NOW)).toBeNull();
    expect(parseStoredAttribution(JSON.stringify({ ...stored, sent: ['nonsense'] }), NOW)).toBeNull();
    expect(parseStoredAttribution(JSON.stringify({ ...stored, locale: 'EN' }), NOW)).toBeNull();
  });
});

describe('parsePromoEvent', () => {
  const event = { event: 'add-word', promo: 'blitz', source: 'rankmaker', placement: 'end-card', locale: 'es', variant: '' };

  it('keeps only the known fields of a valid event', () => {
    expect(parsePromoEvent({ ...event, extra: 1 })).toEqual(event);
    expect(parsePromoEvent({ ...event, variant: 'short-1' })).toEqual({ ...event, variant: 'short-1' });
  });

  it('rejects anything else', () => {
    for (const bad of [
      null,
      [],
      'add-word',
      { ...event, event: 'create-space' },
      { ...event, promo: 'sendself' },
      { ...event, source: 'elsewhere' },
      { ...event, placement: '' },
      { ...event, placement: 'End-Card' },
      { ...event, locale: 'esp' },
      { ...event, variant: '-x' },
      { ...event, variant: undefined },
    ]) {
      expect(parsePromoEvent(bad)).toBeNull();
    }
  });
});

/** A Storage backed by a Map, as the browser's would be. */
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

describe('trackPromoStep', () => {
  let storage: Storage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = memoryStorage();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { webdriver: false });
  });

  afterEach(() => vi.unstubAllGlobals());

  function attribute(overrides: Partial<PromoAttribution> = {}): void {
    const attribution: PromoAttribution = {
      promo: 'blitz',
      source: 'rankmaker',
      placement: 'end-card',
      locale: 'es',
      variant: 'short-1',
      at: Date.now(),
      sent: [],
      ...overrides,
    };
    storage.setItem('promo-attribution', JSON.stringify(attribution));
  }

  it("sends a step once per attribution, with the contract's body", () => {
    attribute();
    trackPromoStep('add-word');
    trackPromoStep('add-word');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/promo-event');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(init.body)).toEqual({ event: 'add-word', promo: 'blitz', source: 'rankmaker', placement: 'end-card', locale: 'es', variant: 'short-1' });
    expect(JSON.parse(storage.getItem('promo-attribution')!).sent).toEqual(['add-word']);
  });

  it('sends nothing without an attribution', () => {
    trackPromoStep('open-app');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops an expired attribution and sends nothing', () => {
    attribute({ at: Date.now() - PROMO_ATTRIBUTION_TTL_MS - 1 });
    trackPromoStep('open-app');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.getItem('promo-attribution')).toBeNull();
  });

  it('sends nothing from an automated browser', () => {
    vi.stubGlobal('navigator', { webdriver: true });
    attribute();
    trackPromoStep('start-game');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when storage or fetch refuse', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => trackPromoStep('open-app')).not.toThrow();

    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', () => {
      throw new Error('no fetch');
    });
    attribute();
    expect(() => trackPromoStep('open-app')).not.toThrow();
  });
});

describe('startPromoTracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('counts one arrival when the same link loads twice within seconds (installed-app redirect)', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const href = 'https://blitz.4oli.com/?utm_source=rankmaker&utm_medium=promo&utm_content=home&promo_lang=es';
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { webdriver: false });
    vi.stubGlobal('location', { href });
    vi.stubGlobal('history', { state: null, replaceState: vi.fn() });
    vi.stubGlobal('document', { documentElement: { lang: 'en' }, visibilityState: 'hidden', addEventListener: vi.fn() });
    vi.stubGlobal('addEventListener', vi.fn());

    startPromoTracking();
    vi.advanceTimersByTime(2_000);
    startPromoTracking();

    const arrivals = fetchMock.mock.calls.filter((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).event === 'arrive');
    expect(arrivals).toHaveLength(1);
  });
});
