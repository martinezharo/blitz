import '@fontsource-variable/nunito';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { keepUpdated } from './shared/app-update.ts';
import './styles/global.css';

// Keeps the app shell on the device so Blitz opens offline, and on the latest
// build. Built only, since the dev server has no /sw.js and a worker would
// fight hot reloading.
if (import.meta.env.PROD) keepUpdated();

// Development only, and dropped from the production build.
const seeded = import.meta.env.DEV ? import('./data/dev-seed.ts').then((seed) => seed.seedFromUrl()) : Promise.resolve();

seeded.finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
