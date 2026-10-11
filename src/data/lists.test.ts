import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadList } from './lists.ts';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('loadList', () => {
  it('asks for a list once', async () => {
    const fetcher = vi.fn(async () => json({ de: [], en: [] }));
    vi.stubGlobal('fetch', fetcher);
    await loadList('once');
    await loadList('once');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/lists/once.json');
  });

  it('does not remember a failure, or the page the app answers for a path it does not have', async () => {
    const fetcher = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(json({ de: [1], en: [] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadList('later')).rejects.toThrow();
    await expect(loadList('later')).resolves.toEqual({ de: [1], en: [] });
  });
});
