import '@fontsource-variable/nunito';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { keepUpdated } from './shared/app-update.ts';
import { startPromoTracking, trackPromoStep } from './shared/promo.ts';
import './styles/global.css';

// Before the app reads or rewrites the address: a visit from a promo on another
// site, and, for one, that it got as far as the app.
startPromoTracking();
trackPromoStep('open-app');

// Keeps the app shell on the device so Blitz opens offline, and on the latest
// build. Built only, since the dev server has no /sw.js and a worker would
// fight hot reloading.
if (import.meta.env.PROD) keepUpdated();

// How long the first paint waits for Nunito before going ahead without it.
const FONT_PATIENCE_MS = 600;

/**
 * Nunito, loaded before the first paint. The browser only fetches a font once
 * text needs it, so the page would paint in the fallback font and then reflow
 * into Nunito a moment later, nudging everything, the tab bar included. The
 * installed app has it stored, so the wait is a few milliseconds; a first
 * visit on a slow connection paints without it rather than wait on.
 */
function fontReady(): Promise<unknown> {
  if (!document.fonts) return Promise.resolve();
  const patience = new Promise((resolve) => setTimeout(resolve, FONT_PATIENCE_MS));
  // Bold, and with the umlauts, so the subset German needs is the one fetched.
  const font = document.fonts.load(`700 1rem 'Nunito Variable'`, 'Blitz äöüß').catch(() => {});
  return Promise.race([font, patience]);
}

// Development only, and dropped from the production build.
const seeded = import.meta.env.DEV ? import('./data/dev-seed.ts').then((seed) => seed.seedFromUrl()) : Promise.resolve();

Promise.allSettled([seeded, fontReady()]).finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
