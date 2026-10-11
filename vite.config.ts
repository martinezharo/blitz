import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Sends plain-HTTP visits on the tailnet IP to the same server's HTTPS
 * address, since sign-in and sync only work on a secure origin. The dev box
 * pairs each port with that address in DEV_HTTPS_ORIGINS
 * (`5173=https://<host>:8443,...`); without it, or on localhost, nothing moves.
 */
function secureOrigin(): Plugin {
  const origins = new Map(
    (process.env.DEV_HTTPS_ORIGINS ?? '')
      .split(',')
      .map((pair) => pair.trim().split('='))
      .filter((pair): pair is [string, string] => pair.length === 2 && pair.every(Boolean)),
  );
  return {
    name: 'blitz:secure-origin',
    apply: 'serve',
    configureServer(server) {
      if (origins.size === 0) return;
      server.middlewares.use((request, response, next) => {
        const origin = origins.get(String(request.socket.localPort));
        const host = new URL(`http://${request.headers.host ?? 'localhost'}`).hostname;
        // Already behind Tailscale's HTTPS, or local where http is secure too.
        if (!origin || request.headers['x-forwarded-proto'] === 'https' || ['localhost', '127.0.0.1', '[::1]'].includes(host)) {
          return next();
        }
        // A path like `//elsewhere.example` would resolve to another host.
        const target = new URL(request.url ?? '/', origin);
        if (target.origin !== new URL(origin).origin) return next();
        response.statusCode = 307;
        response.setHeader('Location', target.toString());
        response.end();
      });
    },
  };
}

/**
 * Emits /sw.js from src/shared/sw.js, with this build's file names filled in.
 * The version is a hash of those names (they carry content hashes), the page
 * and the logo, which keep their names, so a new build is a new service worker
 * and an unchanged one is not.
 */
function serviceWorker(): Plugin {
  return {
    name: 'blitz:service-worker',
    apply: 'build',
    // After Vite's own plugins, which emit the page last.
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        if (this.environment.name !== 'client') return;
        const files = Object.keys(bundle)
          .filter((name) => !name.endsWith('.map'))
          .map((name) => `/${name}`)
          .sort();
        const shell = ['/', '/logo.svg', ...files.filter((name) => /\.(js|css|woff2)$/.test(name))];
        const page = (bundle['index.html'] as { source?: string | Uint8Array } | undefined)?.source ?? '';
        const version = createHash('sha256')
          .update(files.join('\n'))
          .update(page)
          .update(readFileSync(new URL('./public/logo.svg', import.meta.url)))
          .digest('hex')
          .slice(0, 12);
        const source = readFileSync(new URL('./src/shared/sw.js', import.meta.url), 'utf8')
          .replace('__VERSION__', () => version)
          .replace("'__KNOWN__'", () => JSON.stringify(files))
          .replace("'__PRECACHE__'", () => JSON.stringify(shell));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      },
    },
  };
}

export default defineConfig({
  // The Worker (/api) runs inside the dev server, on local D1 and R2.
  plugins: [secureOrigin(), react(), cloudflare(), serviceWorker()],
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
