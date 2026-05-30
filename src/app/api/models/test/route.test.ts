import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function makeReq(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  url = 'https://reader.example.com/api/models/test',
): Request {
  return {
    headers: new Headers(headers),
    url,
    json: async () => body,
  } as unknown as Request;
}

function makeInvalidJsonReq(): Request {
  return {
    headers: new Headers(),
    url: 'https://reader.example.com/api/models/test',
    json: async () => {
      throw new SyntaxError('bad json');
    },
  } as unknown as Request;
}

describe('POST /api/models/test', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects invalid JSON', async () => {
    const res = await POST(makeInvalidJsonReq());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' });
  });

  it('requires apiKey and baseUrl', async () => {
    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: '',
      apiKey: '',
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'apiKey and baseUrl required' });
  });

  it('rejects unsupported provider protocols instead of probing them as OpenAI-compatible', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'ollama',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test',
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid provider protocol' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin browser requests before parsing the body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = makeReq(
      {
        protocol: 'openai',
        baseUrl: 'https://provider.example.com/v1',
        apiKey: 'sk-test',
      },
      { origin: 'https://evil.example.com' },
    );
    const jsonSpy = vi.spyOn(req, 'json');

    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden origin' });
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'ftp://provider.example.com/v1',
    'javascript:alert(1)',
    'https://user:pass@provider.example.com/v1',
    'not a url',
    'https://provider.example.com/v1\nx',
  ])('rejects unsafe baseUrl %s before probing providers', async baseUrl => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl,
      apiKey: 'sk-test',
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      baseUrl.includes('\n')
        ? { error: 'apiKey and baseUrl required' }
        : { error: 'Invalid baseUrl' },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok for a successful OpenAI-compatible model request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1///',
      apiKey: 'sk-test',
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://provider.example.com/v1/models', {
      headers: { Authorization: 'Bearer sk-test' },
    });
  });

  it('trims credential fields before probing providers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: '  https://provider.example.com/v1///  ',
      apiKey: '  sk-test  ',
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://provider.example.com/v1/models', {
      headers: { Authorization: 'Bearer sk-test' },
    });
  });

  it('redacts and truncates upstream OpenAI-compatible errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        `{"error":"bad","api_key":"sk-secret-value-123456789","Authorization":"Bearer token-secret-123456"} ${'x'.repeat(400)}`,
        { status: 401 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test',
    }));
    const json = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/^HTTP 401: /);
    expect(json.error).toContain('[redacted]');
    expect(json.error).not.toContain('sk-secret-value-123456789');
    expect(json.error).not.toContain('token-secret-123456');
    expect(json.error.length).toBeLessThanOrEqual(253);
  });

  it('redacts and truncates Anthropic upstream errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        `invalid x-api-key: sk-ant-secret-value-123456789 ${'y'.repeat(400)}`,
        { status: 403 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.example.com',
      apiKey: 'sk-ant-test',
    }));
    const json = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/^HTTP 403: /);
    expect(json.error).toContain('[redacted]');
    expect(json.error).not.toContain('sk-ant-secret-value-123456789');
    expect(json.error.length).toBeLessThanOrEqual(253);
  });

  it('redacts thrown provider request errors', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(
      new Error(`network Authorization=Bearer token-secret-123456 ${'z'.repeat(400)}`),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test',
    }));
    const json = await res.json() as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toContain('Provider network error:');
    expect(json.error).toContain('[redacted]');
    expect(json.error).not.toContain('token-secret-123456');
    expect(json.error.length).toBeLessThanOrEqual(268);
  });

  it('classifies request timeouts without leaking credentials', async () => {
    const timeoutError = new DOMException(
      'Request timeout Authorization=Bearer token-secret-123456',
      'AbortError',
    );
    const fetchMock = vi.fn().mockRejectedValueOnce(timeoutError);
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test-secret-123456789',
    }));
    const json = await res.json() as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe(
      'Provider request timed out: Request timeout Authorization=[redacted]',
    );
    expect(json.error).not.toContain('token-secret-123456');
    expect(json.error).not.toContain('sk-test-secret-123456789');
  });
});
