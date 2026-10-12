import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Every worktree has its own local database. Apply pending migrations before
// serving requests, including when account sign-in is proxied to production.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'd1', 'migrations', 'apply', 'blitz', '--local',
], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'inherit', 'inherit'] });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
