import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/exports', () => {
  it('keeps server-side export reserved while export runs in the browser', async () => {
    const res = await POST();

    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toEqual({
      error: 'Export runs client-side (IndexedDB is browser-only).',
    });
  });
});
