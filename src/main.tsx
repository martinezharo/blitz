import '@fontsource-variable/nunito';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import './styles/global.css';

// Development only, and dropped from the production build.
const seeded = import.meta.env.DEV ? import('./data/dev-seed.ts').then((seed) => seed.seedFromUrl()) : Promise.resolve();

seeded.finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
