import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService } from './AIService';
import type { ConfigService } from './ConfigService';
import type { CostMeter } from './CostMeter';
import type { KeyVault } from './KeyVault';
import type { ModelServiceRepo, TimelineRepo } from '@/adapters/storage/interfaces';
import type { ModelService } from '@/types/domain';

const service: ModelService = {
  id: 'svc',
  name: 'Test Service',
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKeyCipher: '',
  enabled: true,
  enabledModels: ['model'],
  createdAt: new Date(),
};

function makeAIService(): AIService {
  const services = {
    get: vi.fn(async () => service),
  } as unknown as ModelServiceRepo;
  const vault = {
    getApiKey: vi.fn(async () => 'sk-test'),
  } as unknown as KeyVault;
  const timeline = {
    create: vi.fn(async () => undefined),
  } as unknown as TimelineRepo;
  const cost = {
    estimateUSD: vi.fn(() => 0),
    record: vi.fn(async () => undefined),
  } as unknown as CostMeter;
  const config = {
    getTaskRouting: vi.fn(async () => ({
      translate: { serviceId: 'svc', modelId: 'model' },
      explain: { serviceId: 'svc', modelId: 'model' },
      verify: { serviceId: 'svc', modelId: 'model' },
      summarize: { serviceId: 'svc', modelId: 'model' },
      chat: { serviceId: 'svc', modelId: 'model' },
    })),
    getPromptOverrides: vi.fn(async () => ({
      translate: '',
      explain: '',
      verify: '',
      summarize: '',
      chat: '',
    })),
  } as unknown as ConfigService;

  return new AIService(services, vault, timeline, cost, config);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AIService.parseVerifyResponse', () => {
  it('parses a clean JSON fence', () => {
    const text = 'Some prose...\n```json\n{"summary":"x","supporting":[],"opposing":[],"verdict":"contested","confidence":"medium"}\n```';
    const r = AIService.parseVerifyResponse(text);
    expect(r?.verdict).toBe('contested');
    expect(r?.confidence).toBe('medium');
    expect(r?.summary).toBe('x');
  });

  it('parses JSON without fence', () => {
    const text = 'Prefix...\n{"summary":"y","supporting":[{"url":"http://x","title":"t","snippet":"s"}],"opposing":[],"verdict":"widely_accepted","confidence":"high"}';
    const r = AIService.parseVerifyResponse(text);
    expect(r?.verdict).toBe('widely_accepted');
    expect(r?.supporting.length).toBe(1);
  });

  it('returns null on missing verdict', () => {
    expect(AIService.parseVerifyResponse('{"summary":"x"}')).toBeNull();
  });

  it('returns null on no JSON', () => {
    expect(AIService.parseVerifyResponse('plain text only')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(AIService.parseVerifyResponse('{ broken json')).toBeNull();
  });

  it('handles missing fields with sensible defaults', () => {
    const r = AIService.parseVerifyResponse(
      '{"verdict":"insufficient","confidence":"low"}',
    );
    expect(r?.summary).toBe('');
    expect(r?.supporting).toEqual([]);
    expect(r?.opposing).toEqual([]);
  });

  it('rejects invalid verdict and confidence values', () => {
    expect(
      AIService.parseVerifyResponse(
        '{"verdict":"maybe","confidence":"low","supporting":[],"opposing":[]}',
      ),
    ).toBeNull();
    expect(
      AIService.parseVerifyResponse(
        '{"verdict":"insufficient","confidence":"certain","supporting":[],"opposing":[]}',
      ),
    ).toBeNull();
  });

  it('filters invalid source references from verify responses', () => {
    const r = AIService.parseVerifyResponse(JSON.stringify({
      verdict: 'contested',
      confidence: 'medium',
      supporting: [
        { url: 'https://valid.example', title: 'Valid', snippet: 'ok' },
        { url: '', title: 'Missing url', snippet: 'bad' },
        { url: 'https://missing-title.example', snippet: 'bad' },
        { url: 'https://bad-date.example', title: 'Bad date', snippet: 'bad', publishedAt: 'not-a-date' },
      ],
      opposing: [
        { url: 'https://date.example', title: 'Date', snippet: 'ok', publishedAt: '2026-01-01T00:00:00.000Z' },
      ],
    }));

    expect(r?.supporting).toEqual([
      { url: 'https://valid.example', title: 'Valid', snippet: 'ok' },
    ]);
    expect(r?.opposing[0]).toMatchObject({
      url: 'https://date.example',
      title: 'Date',
      snippet: 'ok',
    });
    expect(r?.opposing[0]?.publishedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });
});

describe('AIService dispatch cancellation', () => {
  it('aborts the in-flight fetch and rejects done', async () => {
    let capturedSignal: AbortSignal | undefined;
    let rejectFetch!: (reason: Error) => void;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        rejectFetch = reject;
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = makeAIService().translate({
      text: 'hello',
      bookId: 'b1',
      chapterId: 'c1',
    });

    const firstChunk = result.chunks.next();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    result.cancel();
    expect(capturedSignal?.aborted).toBe(true);
    rejectFetch(new Error('aborted by test'));

    await expect(firstChunk).resolves.toMatchObject({
      value: { type: 'error', error: '已停止生成', errorKind: 'cancelled', retryable: false },
      done: false,
    });
    await expect(result.done).rejects.toThrow('已停止生成');
  });
});

describe('AIService error handling', () => {
  it('classifies common client-side failures', () => {
    expect(AIService.classifyError(new Error('Vault is locked. Please enter your master password.'))).toMatchObject({
      kind: 'auth',
      retryable: false,
    });
    expect(AIService.classifyError(new Error('Failed to fetch'))).toMatchObject({
      kind: 'network',
      retryable: true,
    });
  });

  it('retries a transient HTTP failure before streaming starts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(ndjson([
          { type: 'text', text: 'ok' },
          { type: 'usage', inputTokens: 1, outputTokens: 2 },
        ])),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = makeAIService().translate({
      text: 'hello',
      bookId: 'b1',
      chapterId: 'c1',
    });

    const chunks = [];
    for await (const chunk of result.chunks) chunks.push(chunk);
    await expect(result.done).resolves.toMatchObject({
      aiResponse: 'ok',
      costTokens: { input: 1, output: 2 },
    });
    expect(chunks).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'usage', inputTokens: 1, outputTokens: 2 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry auth failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad key', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = makeAIService().translate({
      text: 'hello',
      bookId: 'b1',
      chapterId: 'c1',
    });

    await expect(result.chunks.next()).resolves.toMatchObject({
      value: {
        type: 'error',
        errorKind: 'auth',
        retryable: false,
      },
      done: false,
    });
    await expect(result.done).rejects.toThrow('AI 服务鉴权失败');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry after text has already streamed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(ndjson([
        { type: 'text', text: 'partial' },
        { type: 'error', error: 'Failed to fetch' },
      ])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = makeAIService().translate({
      text: 'hello',
      bookId: 'b1',
      chapterId: 'c1',
    });

    await expect(result.chunks.next()).resolves.toMatchObject({
      value: { type: 'text', text: 'partial' },
      done: false,
    });
    await expect(result.chunks.next()).resolves.toMatchObject({
      value: {
        type: 'error',
        errorKind: 'network',
        retryable: true,
      },
      done: false,
    });
    await expect(result.done).rejects.toThrow('网络连接异常');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces partial text before a broken stream rejects done', async () => {
    const encoder = new TextEncoder();
    let readCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        readCount += 1;
        if (readCount > 1) {
          controller.error(new Error('Failed to fetch'));
          return;
        }
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', text: 'partial' }) + '\n'));
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream));
    vi.stubGlobal('fetch', fetchMock);

    const result = makeAIService().translate({
      text: 'hello',
      bookId: 'b1',
      chapterId: 'c1',
    });

    await expect(result.chunks.next()).resolves.toMatchObject({
      value: { type: 'text', text: 'partial' },
      done: false,
    });
    await expect(result.chunks.next()).resolves.toMatchObject({
      value: {
        type: 'error',
        errorKind: 'network',
        retryable: true,
      },
      done: false,
    });
    await expect(result.done).rejects.toThrow('网络连接异常');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('compacts long chat history before sending while preserving the latest user input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(ndjson([
        { type: 'text', text: 'answer' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
      ])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = makeAIService().chat({
      history: [
        { role: 'user', content: 'old question '.repeat(700) },
        { role: 'assistant', content: 'old answer '.repeat(700) },
        { role: 'user', content: 'current question' },
      ],
      threadId: 'thread-1',
      bookId: 'b1',
      chapterId: 'c1',
    });

    for await (const chunk of result.chunks) {
      void chunk;
      // drain stream
    }
    await expect(result.done).resolves.toMatchObject({
      userInput: 'current question',
      aiResponse: 'answer',
      threadId: 'thread-1',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      history: Array<{ role: string; content: string }>;
      memorySummary?: string;
    };
    expect(body.history).toEqual([{ role: 'user', content: 'current question' }]);
    expect(body.memorySummary).toContain('old question');
    expect(body.memorySummary).toContain('old answer');
  });
});

function ndjson(chunks: Array<Record<string, unknown>>): string {
  return chunks.map(chunk => JSON.stringify(chunk)).join('\n') + '\n';
}
