/**
 * The promo funnel: what a visitor who arrived from a promo for Blitz on one
 * of the author's other sites (RANKMAKER, Backrooms) went on to do here.
 *
 * The contract, the page tracker (src/shared/promo.ts) and the Worker's checks
 * (worker/promo.ts) are shared with the other promoted sites
 * (@martinezharo/promo-funnel); this names Blitz's own steps. Nothing
 * identifies the visitor: an event names the step, where the promo was shown,
 * its wording and its language, never who followed it.
 */
import { definePromoFunnel } from '@martinezharo/promo-funnel';

export const promoFunnel = definePromoFunnel('blitz', ['open-app', 'sign-in', 'add-word', 'start-game']);

export type PromoEventName = (typeof promoFunnel.steps)[number];
