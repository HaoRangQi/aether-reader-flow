import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  anthropicListModels: vi.fn(),
  openAIListModels: vi.fn(),
}));

vi.mock('@/adapters/models/AnthropicProvider', () => ({
  AnthropicProvider: vi.fn(() => ({
    listModels: mocks.anthropicListModels,
  })),
}));

vi.mock('@/adapters/models/OpenAICompatibleProvider', () => ({
  OpenAICompatibleProvider: vi.fn(() => ({
    listModels: mocks.openAIListModels,
  })),
}));

function makeReq(body: Record<string, unknown>): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

function makeInvalidJsonReq(): Request {
  return {
    json: async () => {
      throw new SyntaxError('bad json');
    },
  } as unknown as Request;
}

describe('POST /api/models/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.anthropicListModels.mockReset();
    mocks.openAIListModels.mockReset();
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
    await expect(res.json()).resolves.toEqual({ error: 'apiKey 与 baseUrl 必填' });
  });

  it('rejects unsupported provider protocols instead of falling back to OpenAI-compatible', async () => {
    const res = await POST(makeReq({
      protocol: 'ollama',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test',
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid provider protocol' });
    expect(mocks.openAIListModels).not.toHaveBeenCalled();
    expect(mocks.anthropicListModels).not.toHaveBeenCalled();
  });

  it('returns provider models on success', async () => {
    const models = [
      {
        id: 'gpt-4o',
        name: 'gpt-4o',
        contextWindow: 0,
        supportsWebSearch: false,
        pricing: { input: 2.5, output: 10 },
      },
    ];
    mocks.openAIListModels.mockResolvedValueOnce(models);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test',
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ models });
  });

  it('trims credential fields before creating the provider', async () => {
    const models = [
      {
        id: 'gpt-4o-mini',
        name: 'gpt-4o-mini',
        contextWindow: 0,
        supportsWebSearch: false,
        pricing: { input: 0.15, output: 0.6 },
      },
    ];
    mocks.openAIListModels.mockResolvedValueOnce(models);

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: '  https://provider.example.com/v1  ',
      apiKey: '  sk-test  ',
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ models });
  });

  it('redacts and truncates provider errors', async () => {
    mocks.openAIListModels.mockRejectedValueOnce(
      new Error(`provider failed api_key=sk-secret-value-123456789 ${'x'.repeat(400)}`),
    );

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test',
    }));
    const json = await res.json() as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toContain('Provider request failed:');
    expect(json.error).toContain('[redacted]');
    expect(json.error).not.toContain('sk-secret-value-123456789');
    expect(json.error.length).toBeLessThanOrEqual(268);
  });

  it('classifies provider network errors without leaking secrets', async () => {
    mocks.openAIListModels.mockRejectedValueOnce(
      new TypeError('fetch failed Authorization=Bearer token-secret-123456'),
    );

    const res = await POST(makeReq({
      protocol: 'openai',
      baseUrl: 'https://provider.example.com/v1',
      apiKey: 'sk-test-secret-123456789',
    }));
    const json = await res.json() as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('Provider network error: fetch failed Authorization=[redacted]');
    expect(json.error).not.toContain('token-secret-123456');
    expect(json.error).not.toContain('sk-test-secret-123456789');
  });
});
