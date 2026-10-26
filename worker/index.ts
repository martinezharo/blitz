import { currentUser, finishGoogleSignIn, me, signOut, startGoogleSignIn } from './auth.ts';
import { correct } from './correct.ts';
import { definition } from './definition.ts';
import { beginLocalSignIn, beginProductionSignIn, exchangeTicket, finishLocalSignIn, proxyAccountRequest, upstreamUser } from './dev-auth.ts';
import type { Env } from './env.ts';
import { problem, sameOrigin } from './http.ts';
import { translate } from './translate.ts';
import { getPhoto, putPhoto, sync } from './sync.ts';
import { voiceModel } from './voices.ts';

/** Only /api reaches this script; everything else is served from the static assets. */
export default {
  async fetch(request, env, ctx?: ExecutionContext) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // Public and served locally even when account requests use production.
    if (pathname.startsWith('/api/voices/')) return voiceModel(request, ctx);

    if (method === 'POST' && pathname === '/api/auth/dev/exchange' && !env.DEVELOPMENT_UPSTREAM) {
      if (request.headers.has('Origin')) return problem(403, 'Browser exchange forbidden');
      return exchangeTicket(request, env);
    }
    if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) return problem(403, 'Cross-origin request');

    if (env.DEVELOPMENT_UPSTREAM) {
      if (method === 'GET' && pathname === '/api/auth/google') return beginLocalSignIn(request, env);
      if (method === 'GET' && pathname === '/api/auth/dev/finish') return finishLocalSignIn(request, env);
      // Checked here, with production's account: production may not have the endpoint yet.
      if (method === 'POST' && pathname === '/api/correct') {
        const user = await upstreamUser(request, env);
        if (!user) return problem(401, 'Not signed in');
        return correct(request, env, user);
      }
      if (method === 'POST' && pathname === '/api/translate') {
        const user = await upstreamUser(request, env);
        if (!user) return problem(401, 'Not signed in');
        return translate(request, env, user);
      }
      if (pathname === '/api/me' || pathname === '/api/sync' || pathname === '/api/definition' || pathname === '/api/auth/sign-out' ||
          /^\/api\/photos\/[^/]+$/.test(pathname)) return proxyAccountRequest(request, env);
      return problem(404, 'Not found');
    }

    if (method === 'GET' && pathname === '/api/auth/dev/start') return beginProductionSignIn(request, env);

    if (method === 'GET' && pathname === '/api/auth/google') return startGoogleSignIn(request, env);
    if (method === 'GET' && pathname === '/api/auth/callback') return finishGoogleSignIn(request, env);
    if (method === 'GET' && pathname === '/api/me') return me(request, env);
    if (method === 'GET' && pathname === '/api/definition') {
      // Before migrations/0003 has been applied there is no table to read: say so, do not crash.
      return definition(request, env).catch((error) => {
        console.error('Definition error:', error);
        return problem(503, 'Definitions are not available');
      });
    }
    if (method === 'POST' && pathname === '/api/auth/sign-out') return signOut(request, env);

    const photo = pathname.match(/^\/api\/photos\/([^/]+)$/);
    if (pathname === '/api/sync' || pathname === '/api/correct' || pathname === '/api/translate' || photo) {
      const user = await currentUser(request, env);
      if (!user) return problem(401, 'Not signed in');
      if (method === 'POST' && pathname === '/api/sync') return sync(request, env, user);
      if (method === 'POST' && pathname === '/api/correct') return correct(request, env, user);
      if (method === 'POST' && pathname === '/api/translate') return translate(request, env, user);
      if (method === 'PUT' && photo) return putPhoto(request, env, user, photo[1]!);
      if (method === 'GET' && photo) return getPhoto(env, user, photo[1]!);
    }

    return problem(404, 'Not found');
  },
} satisfies ExportedHandler<Env>;
