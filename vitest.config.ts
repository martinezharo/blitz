import { defineConfig } from 'vitest/config';

// Apart from vite.config.ts: the Cloudflare plugin runs a dev server of its
// own, and tests build their Worker environment with `getPlatformProxy`.
export default defineConfig({
  test: { testTimeout: 20_000, hookTimeout: 60_000 },
});
