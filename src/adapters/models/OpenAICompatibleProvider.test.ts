import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';

/** Build a ReadableStream from a sequence of UTF-8 string chunks. */
function streamOfChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

const SSE_OK = [
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
  'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
  'data: [DONE]\n\n',
];

describe('OpenAICompatibleProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('parses SSE stream into text + usage chunks', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(streamOfChunks(SSE_OK), { status: 200 }),
    );
    const p = new OpenAICompatibleProvider({
      id: 's1',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-x',
    });
    const out = [];
    for await (const c of p.chat({
      modelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      out.push(c);
    }
    const text = out.filter(c => c.type === 'text').map(c => c.text).join('');
    const usage = out.find(c => c.type === 'usage');

    expect(text).toBe('Hello world');
    expect(usage?.inputTokens).toBe(10);
    expect(usage?.outputTokens).toBe(5);
  });

  it('emits error chunk on non-200 response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );
    const p = new OpenAICompatibleProvider({
      id: 's1',
      baseUrl: 'https://x',
      apiKey: 'sk-x',
    });
    const chunks = [];
    for await (const c of p.chat({
      modelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'x' }],
    })) {
      chunks.push(c);
    }
    const err = chunks.find(c => c.type === 'error');
    expect(err?.error).toMatch(/403/);
  });

  it('strips trailing slash from baseUrl', () => {
    const p = new OpenAICompatibleProvider({
      id: 's1',
      baseUrl: 'https://api.x.com/v1///',
      apiKey: 'k',
    });
    expect(p.baseUrl).toBe('https://api.x.com/v1');
  });

  it('handles split SSE frame across chunks', async () => {
    // Split the second frame across chunk boundaries.
    fetchMock.mockResolvedValueOnce(
      new Response(
        streamOfChunks([
          'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
          'data: {"choices":[{"delta":',
          '{"content":"B"}}]}\n\n',
          'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n',
        ]),
        { status: 200 },
      ),
    );
    const p = new OpenAICompatibleProvider({
      id: 's1',
      baseUrl: 'https://x',
      apiKey: 'k',
    });
    const text = [];
    for await (const c of p.chat({
      modelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'x' }],
    })) {
      if (c.type === 'text') text.push(c.text);
    }
    expect(text.join('')).toBe('AB');
  });

  it('testConnection returns true on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const p = new OpenAICompatibleProvider({
      id: 's1',
      baseUrl: 'https://x',
      apiKey: 'k',
    });
    expect(await p.testConnection()).toBe(true);
  });

  it('testConnection returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net'));
    const p = new OpenAICompatibleProvider({
      id: 's1',
      baseUrl: 'https://x',
      apiKey: 'k',
    });
    expect(await p.testConnection()).toBe(false);
  });
});
