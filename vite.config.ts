import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Worker (/api) runs inside the dev server, on local D1 and R2.
  plugins: [react(), cloudflare()],
  server: {
    // The dev box publishes this server over HTTPS on its Tailscale hostname,
    // the secure origin development sign-in needs. Vite rejects Host headers it
    // doesn't know, and that hostname belongs to the machine, not this repo, so
    // it comes from DEV_ALLOWED_HOSTS (comma-separated). Unset means localhost
    // only, Vite's default.
    allowedHosts: (process.env.DEV_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  },
});
