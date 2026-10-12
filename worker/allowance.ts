import type { Env } from './env.ts';

const day = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);

/**
 * Takes one use from the day's allowances of a model feature, for this account
 * and for everyone, before the model is asked: a failing model still costs a
 * slot, so a loop of retries cannot run it up. Returns whether there was room;
 * when the day's allowance for everyone is gone, the account gets its slot back.
 *
 * Each feature counts apart in `definition_usage`, as `<feature>:all` and
 * `<feature>:user:<id>`. Definitions came first and count as plain `all` and
 * `user:<id>` (feature null).
 */
export async function takeSlot(env: Env, feature: string | null, userId: string, limit: { everyone: number; perAccount: number }): Promise<boolean> {
  const scope = (name: string) => (feature ? `${feature}:${name}` : name);
  const today = day();
  const take = async (scope: string, by: 1 | -1) =>
    (
      await env.DB.prepare(
        'INSERT INTO definition_usage (day, scope, count) VALUES (?1, ?2, MAX(?3, 0)) ON CONFLICT (day, scope) DO UPDATE SET count = MAX(count + ?3, 0) RETURNING count',
      )
        .bind(today, scope, by)
        .first<{ count: number }>()
    )?.count ?? Infinity;
  const own = scope(`user:${userId}`);
  if ((await take(own, 1)) > limit.perAccount) return false;
  const all = await take(scope('all'), 1);
  if (all > limit.everyone) {
    await take(own, -1);
    return false;
  }
  // The first use of the day clears the days that are not needed any more.
  if (all === 1) {
    await env.DB.prepare('DELETE FROM definition_usage WHERE day < ?').bind(day(Date.now() - 7 * 86_400_000)).run();
  }
  return true;
}
