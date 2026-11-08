import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testServer } from './test-server.ts';

let server: Awaited<ReturnType<typeof testServer>>;
let points: AnalyticsEngineDataPoint[] = [];

beforeAll(async () => {
  server = await testServer({ PROMO_ANALYTICS: { writeDataPoint: (point) => void points.push(point ?? {}) } });
});

afterAll(() => server.dispose());

beforeEach(() => {
  points = [];
});

const valid = { event: 'arrive', promo: 'blitz', source: 'backrooms', placement: 'menu', locale: 'de', variant: 'short-1' };
const send = (body: string, headers: Record<string, string> = {}) =>
  server.as(null)('/api/promo-event', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

describe('/api/promo-event', () => {
  it('counts a valid event without an account', async () => {
    const response = await send(JSON.stringify(valid));
    expect(response.status).toBe(204);
    expect(points).toEqual([{ blobs: ['arrive', 'backrooms', 'blitz', 'menu', 'de', 'short-1'], doubles: [1], indexes: ['blitz'] }]);
  });

  it('counts an event with no wording', async () => {
    expect((await send(JSON.stringify({ ...valid, event: 'start-game', variant: '' }))).status).toBe(204);
    expect(points[0]!.blobs).toEqual(['start-game', 'backrooms', 'blitz', 'menu', 'de', '']);
  });

  it('refuses other origins', async () => {
    expect((await send(JSON.stringify(valid), { Origin: 'https://elsewhere.example' })).status).toBe(403);
    expect(points).toHaveLength(0);
  });

  it('refuses what is not JSON, too big or not an event', async () => {
    expect((await send(JSON.stringify(valid), { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send('{'))).toHaveProperty('status', 400);
    expect((await send(JSON.stringify({ ...valid, placement: 'x'.repeat(300) }))).status).toBe(413);
    expect((await send(JSON.stringify({ ...valid, event: 'add-device' }))).status).toBe(400);
    expect((await send(JSON.stringify({ ...valid, promo: 'sendself' }))).status).toBe(400);
    expect((await send(JSON.stringify({ ...valid, locale: 'deu' }))).status).toBe(400);
    expect((await send(JSON.stringify({ ...valid, variant: 'Short' }))).status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('only takes POST', async () => {
    expect((await server.as(null)('/api/promo-event')).status).toBe(404);
  });
});
