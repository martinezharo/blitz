import { currentUser, deleteAccount, finishGoogleSignIn, me, signOut, startGoogleSignIn } from './auth.ts';
import { beginAppSignIn, exchangeAppTicket } from './app-auth.ts';
import { correct } from './correct.ts';
import { definition } from './definition.ts';
import { beginLocalSignIn, beginProductionSignIn, exchangeTicket, finishLocalSignIn, proxyAccountRequest, upstreamUser } from './dev-auth.ts';
import type { Env } from './env.ts';
import { problem, sameOrigin } from './http.ts';
import { prepareSpeech, say } from './say.ts';
import { getPhoto, putPhoto, sync } from './sync.ts';
import { voiceModel } from './voices.ts';

/** Only /api reaches this script; everything else is served from the static assets. */
export default {
  async fetch(request, env, ctx?: ExecutionContext) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // Public and served locally even when account requests use production.
    if (pathname.startsWith('/api/voices/')) return voiceModel(request, ctx);
    // One word, said aloud: no account, no database, cached at the edge.
    if (pathname === '/api/say' && (method === 'GET' || method === 'HEAD')) return say(request, env);

    if (method === 'POST' && pathname === '/api/auth/dev/exchange' && !env.DEVELOPMENT_UPSTREAM) {
      if (request.headers.has('Origin')) return problem(403, 'Browser exchange forbidden');
      return exchangeTicket(request, env);
    }
    // The app is not a browser: it has no Origin, and the ticket is bound to
    // the verifier it kept, so a cross-origin post could not spend it.
    if (method === 'POST' && pathname === '/api/auth/app/exchange' && !env.DEVELOPMENT_UPSTREAM) {
      return exchangeAppTicket(request, env);
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
      if (pathname === '/api/me' || pathname === '/api/sync' || pathname === '/api/definition' || pathname === '/api/auth/sign-out' ||
          /^\/api\/photos\/[^/]+$/.test(pathname)) return proxyAccountRequest(request, env);
      return problem(404, 'Not found');
    }

    if (method === 'GET' && pathname === '/api/auth/dev/start') return beginProductionSignIn(request, env);

    if (method === 'GET' && pathname === '/api/auth/google') return startGoogleSignIn(request, env);
    if (method === 'GET' && pathname === '/api/auth/callback') return finishGoogleSignIn(request, env);
    // The app's sign-in: the same Google flow, handed back on a custom scheme.
    if (method === 'GET' && pathname === '/api/auth/app/start') return beginAppSignIn(request, env);
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
    if (pathname === '/api/sync' || pathname === '/api/correct' || pathname === '/api/say/prepare' ||
        pathname === '/api/account' || photo) {
      const user = await currentUser(request, env);
      if (!user) return problem(401, 'Not signed in');
      if (method === 'POST' && pathname === '/api/sync') return sync(request, env, user);
      if (method === 'POST' && pathname === '/api/correct') return correct(request, env, user);
      if (method === 'POST' && pathname === '/api/say/prepare') return prepareSpeech(request, env, ctx);
      if (method === 'DELETE' && pathname === '/api/account') return deleteAccount(request, env);
      if (method === 'PUT' && photo) return putPhoto(request, env, user, photo[1]!);
      if (method === 'GET' && photo) return getPhoto(env, user, photo[1]!);
    }

    return problem(404, 'Not found');
  },
} satisfies ExportedHandler<Env>;
