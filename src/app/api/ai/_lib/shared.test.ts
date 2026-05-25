import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { readAIEnvelope, streamChunks } from './shared';
import type { ChatChunk } from '@/types/api';

const validEnvelope = {
  serviceId: 'svc-1',
  modelId: 'model-1',
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
};

function makeReq(
  headers: Record<string, string> = {},
  body: unknown = validEnvelope,
): NextRequest {
  const h = new Headers(headers);
  return {
    headers: h,
    nextUrl: new URL('https://reader.example.com/api/ai/chat'),
    json: vi.fn(async () => body),
  } as unknown as NextRequest;
}

async function responseChunks(response: Response): Promise<ChatChunk[]> {
  const text = await response.text();
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as ChatChunk);
}

describe('AI route shared helpers', () => {
  it('accepts same-origin requests', async () => {
    const parsed = await readAIEnvelope(makeReq({ origin: 'https://reader.example.com' }));
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.env.modelId).toBe('model-1');
      expect(parsed.env.baseUrl).toBe('https://api.example.com/v1');
    }
  });

  it('rejects cross-origin requests before parsing the body', async () => {
    const req = makeReq({ origin: 'https://evil.example.com' });
    const parsed = await readAIEnvelope(req);
    expect('error' in parsed).toBe(true);
    if ('error' in parsed) {
      expect(parsed.error.status).toBe(403);
      await expect(parsed.error.text()).resolves.toBe('Forbidden origin');
    }
    expect(req.json).not.toHaveBeenCalled();
  });

  it('accepts requests without origin for non-browser clients and tests', async () => {
    const parsed = await readAIEnvelope(makeReq());
    expect('error' in parsed).toBe(false);
  });

  it('accepts same-origin requests from the referer when origin is absent', async () => {
    const parsed = await readAIEnvelope(
      makeReq({ referer: 'https://reader.example.com/books/123?chapter=1' }),
    );
    expect('error' in parsed).toBe(false);
  });

  it('rejects cross-origin referer requests when origin is absent', async () => {
    const parsed = await readAIEnvelope(
      makeReq({ referer: 'https://evil.example.com/books/123' }),
    );
    expect('error' in parsed).toBe(true);
    if ('error' in parsed) {
      expect(parsed.error.status).toBe(403);
    }
  });

  it('rejects invalid referer values when origin is absent', async () => {
    const parsed = await readAIEnvelope(makeReq({ referer: 'not a url' }));
    expect('error' in parsed).toBe(true);
    if ('error' in parsed) {
      expect(parsed.error.status).toBe(403);
    }
  });

  it.each(['serviceId', 'modelId', 'baseUrl', 'apiKey'] as const)(
    'rejects blank %s without echoing sensitive request data',
    async field => {
      const body = { ...validEnvelope, apiKey: 'sk-secret-123456', [field]: '   ' };
      const parsed = await readAIEnvelope(makeReq({}, body));

      expect('error' in parsed).toBe(true);
      if ('error' in parsed) {
        expect(parsed.error.status).toBe(400);
        const text = await parsed.error.text();
        expect(text).not.toContain('sk-secret-123456');
        expect(text).not.toContain(JSON.stringify(body));
      }
    },
  );

  it.each(['serviceId', 'modelId', 'baseUrl', 'apiKey'] as const)(
    'rejects control characters in %s without echoing sensitive request data',
    async field => {
      const body = { ...validEnvelope, apiKey: 'sk-secret-123456', [field]: 'bad\nvalue' };
      const parsed = await readAIEnvelope(makeReq({}, body));

      expect('error' in parsed).toBe(true);
      if ('error' in parsed) {
        expect(parsed.error.status).toBe(400);
        const text = await parsed.error.text();
        expect(text).toBe('Missing required AI envelope fields');
        expect(text).not.toContain('sk-secret-123456');
        expect(text).not.toContain(JSON.stringify(body));
      }
    },
  );

  it.each([
    'ftp://api.example.com',
    'javascript:alert(1)',
    'not a url',
    'https://user:pass@api.example.com/v1',
  ])(
    'rejects invalid baseUrl %s',
    async baseUrl => {
      const parsed = await readAIEnvelope(makeReq({}, { ...validEnvelope, baseUrl }));

      expect('error' in parsed).toBe(true);
      if ('error' in parsed) {
        expect(parsed.error.status).toBe(400);
      }
    },
  );

  it.each([0, -1, 1.5, 200_001])('rejects invalid maxTokens %s', async maxTokens => {
    const parsed = await readAIEnvelope(makeReq({}, { ...validEnvelope, maxTokens }));

    expect('error' in parsed).toBe(true);
    if ('error' in parsed) {
      expect(parsed.error.status).toBe(400);
    }
  });

  it('accepts a positive integer maxTokens within the configured ceiling', async () => {
    const parsed = await readAIEnvelope(makeReq({}, { ...validEnvelope, maxTokens: 200_000 }));

    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.env.maxTokens).toBe(200_000);
    }
  });

  it('rejects non-boolean webSearch values', async () => {
    const parsed = await readAIEnvelope(makeReq({}, { ...validEnvelope, webSearch: 'true' }));

    expect('error' in parsed).toBe(true);
    if ('error' in parsed) {
      expect(parsed.error.status).toBe(400);
    }
  });

  it('accepts boolean webSearch values', async () => {
    const parsed = await readAIEnvelope(makeReq({}, { ...validEnvelope, webSearch: false }));

    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.env.webSearch).toBe(false);
    }
  });

  it('keeps non-sensitive stream error messages', async () => {
    async function* chunks(): AsyncIterable<ChatChunk> {
      yield { type: 'text', text: 'before' };
      throw new Error('upstream timeout');
    }

    const parsed = await responseChunks(streamChunks(chunks()));

    expect(parsed).toEqual([
      { type: 'text', text: 'before' },
      { type: 'error', error: 'upstream timeout' },
    ]);
  });

  it('does not leak secrets from thrown stream errors', async () => {
    async function* chunks(): AsyncIterable<ChatChunk> {
      throw new Error('provider failed with apiKey sk-secret-123456');
    }

    const parsed = await responseChunks(streamChunks(chunks()));

    expect(parsed).toEqual([{ type: 'error', error: 'AI stream failed' }]);
    expect(JSON.stringify(parsed)).not.toContain('sk-secret-123456');
  });
});
