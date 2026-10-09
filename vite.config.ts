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
        response.statusCode = 307;
        response.setHeader('Location', new URL(request.url ?? '/', origin).toString());
        response.end();
      });
    },
  };
}

export default defineConfig({
  // The Worker (/api) runs inside the dev server, on local D1 and R2.
  plugins: [secureOrigin(), react(), cloudflare()],
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
