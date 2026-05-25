import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/books/upload', () => {
  it('keeps server-side upload reserved while upload runs in the browser', async () => {
    const res = await POST();

    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toEqual({
      error: 'Client-side upload preferred in MVP; this route is reserved.',
    });
  });
});
