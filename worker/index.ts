import { currentUser, finishGoogleSignIn, me, signOut, startGoogleSignIn } from './auth.ts';
import type { Env } from './env.ts';
import { problem, sameOrigin } from './http.ts';
import { getPhoto, putPhoto, sync } from './sync.ts';

/** Only /api reaches this script; everything else is served from the static assets. */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) return problem(403, 'Cross-origin request');

    if (method === 'GET' && pathname === '/api/auth/google') return startGoogleSignIn(request, env);
    if (method === 'GET' && pathname === '/api/auth/callback') return finishGoogleSignIn(request, env);
    if (method === 'GET' && pathname === '/api/me') return me(request, env);
    if (method === 'POST' && pathname === '/api/auth/sign-out') return signOut(request, env);

    const photo = pathname.match(/^\/api\/photos\/([^/]+)$/);
    if (pathname === '/api/sync' || photo) {
      const user = await currentUser(request, env);
      if (!user) return problem(401, 'Not signed in');
      if (method === 'POST' && pathname === '/api/sync') return sync(request, env, user);
      if (method === 'PUT' && photo) return putPhoto(request, env, user, photo[1]!);
      if (method === 'GET' && photo) return getPhoto(env, user, photo[1]!);
    }

    return problem(404, 'Not found');
  },
} satisfies ExportedHandler<Env>;
