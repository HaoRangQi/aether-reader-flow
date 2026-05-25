import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from './route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    headers: new Headers(),
    nextUrl: new URL('https://reader.example.com/api/ai/verify'),
    json: async () => body,
  } as unknown as NextRequest;
}

describe('POST /api/ai/verify', () => {
  it('returns 400 when required text/context is missing', async () => {
    const res = await POST(makeReq({
      serviceId: 'svc-openai',
      modelId: 'gpt-compatible',
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      text: '',
      context: '',
    }));

    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toBe('Missing text/context');
  });
});
