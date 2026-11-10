/**
 * The promo funnel: what a visitor who arrived from a promo for Blitz on one
 * of the author's other sites (RANKMAKER, Backrooms) went on to do here.
 *
 * Shared by the page that reports the steps (src/shared/promo.ts) and the
 * Worker that counts them (worker/promo.ts), so both read the same list.
 * Nothing identifies the visitor: an event names the step, where the promo was
 * shown, its wording and its language, never who followed it.
 */

/** This site's name in the shared `promo_events` dataset. */
export const PROMO_NAME = 'blitz';

/** The sites whose promos link here. */
export const PROMO_SOURCES = ['rankmaker', 'backrooms'] as const;
type PromoSource = (typeof PROMO_SOURCES)[number];

/** Every step of the funnel, in the order a visitor normally reaches them. */
export const PROMO_EVENTS = ['arrive', 'stay-10s', 'stay-1m', 'stay-3m', 'open-app', 'sign-in', 'add-word', 'start-game'] as const;
export type PromoEventName = (typeof PROMO_EVENTS)[number];

/** A placement or wording id: short, lowercase, URL-safe. */
export const PROMO_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** A two-letter base language. */
export const PROMO_LOCALE = /^[a-z]{2}$/;

/** The body of `POST /api/promo-event`. */
export interface PromoEvent {
  event: PromoEventName;
  promo: typeof PROMO_NAME;
  source: PromoSource;
  placement: string;
  locale: string;
  /** The wording the promo was shown with, or '' when the link named none. */
  variant: string;
}

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** Validate a promo event strictly, returning only the known fields. */
export function parsePromoEvent(value: unknown): PromoEvent | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { event, promo, source, placement, locale, variant } = value as Record<string, unknown>;
  if (!isOneOf(PROMO_EVENTS, event) || promo !== PROMO_NAME || !isOneOf(PROMO_SOURCES, source)) return null;
  if (typeof placement !== 'string' || !PROMO_ID.test(placement)) return null;
  if (typeof locale !== 'string' || !PROMO_LOCALE.test(locale)) return null;
  if (typeof variant !== 'string' || (variant !== '' && !PROMO_ID.test(variant))) return null;
  return { event, promo, source, placement, locale, variant };
}
