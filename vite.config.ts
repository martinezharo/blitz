import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Worker (/api) runs inside the dev server, on local D1 and R2.
  plugins: [react(), cloudflare()],
});
