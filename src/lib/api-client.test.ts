import { afterEach, describe, expect, it, vi } from 'vitest';
import { postJSON } from './api-client';

describe('postJSON', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts JSON and returns the parsed response body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(postJSON<{ ok: boolean }>('/api/example', { value: 1 }))
      .resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
  });

  it('redacts sensitive values and truncates long API error responses', async () => {
    const longTail = 'x'.repeat(800);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'upstream rejected Bearer secret-token-value',
          apiKey: 'sk-secret1234567890',
          token: 'session-token-value',
          detail: longTail,
        }),
        { status: 502 },
      ),
    );

    let message = '';
    try {
      await postJSON('/api/example', {});
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/^API \/api\/example failed \(502\): .{500}…$/);
    expect(message).not.toContain('secret-token-value');
    expect(message).not.toContain('sk-secret1234567890');
    expect(message).not.toContain('session-token-value');
  });

  it('uses a stable message for empty API error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));

    await expect(postJSON('/api/example', {})).rejects.toThrow(
      'API /api/example failed (500): Empty error response',
    );
  });

  it('redacts sensitive query params from API error paths', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad request', { status: 400 }));

    await expect(
      postJSON('/api/example?apiKey=sk-secret1234567890&token=session-token-value&safe=1', {}),
    ).rejects.toThrow(
      'API /api/example?apiKey=%5Bredacted%5D&token=%5Bredacted%5D&safe=1 failed (400): bad request',
    );
  });

  it('wraps network failures with a redacted request path and message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('failed to reach Bearer secret-token-value'),
    );

    await expect(
      postJSON('/api/example?token=session-token-value', {}),
    ).rejects.toThrow(
      'API /api/example?token=%5Bredacted%5D request failed: failed to reach Bearer [redacted]',
    );
  });

  it('reports invalid JSON success responses without exposing the response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json with sk-secret1234567890', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(postJSON('/api/example', {})).rejects.toThrow(
      'API /api/example returned invalid JSON (200)',
    );
  });

  it('allows empty successful responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 204 }));

    await expect(postJSON<void>('/api/example', {})).resolves.toBeUndefined();
  });
});
