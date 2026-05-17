import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';

// Mock the Anthropic SDK's default export.
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class FakeAnthropic {
      apiKey: string;
      baseURL: string;
      constructor(opts: { apiKey: string; baseURL: string }) {
        this.apiKey = opts.apiKey;
        this.baseURL = opts.baseURL;
      }
      messages = {
        // For testConnection
        create: vi.fn(async () => ({ id: 'msg' })),
        // For chat streaming. Returns an async iterable.
        stream: vi.fn(() => {
          const events = [
            { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
            { type: 'message_delta', usage: { output_tokens: 5 } },
          ];
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of events) yield e;
            },
          };
        }),
      };
    },
  };
});

describe('AnthropicProvider', () => {
  let p: AnthropicProvider;
  beforeEach(() => {
    p = new AnthropicProvider({ id: 's1', apiKey: 'sk-test' });
  });

  it('streams text chunks then a final usage chunk', async () => {
    const chunks = [];
    for await (const c of p.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }
    const texts = chunks.filter(c => c.type === 'text').map(c => c.text).join('');
    const usage = chunks.find(c => c.type === 'usage');

    expect(texts).toBe('Hello world');
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBe(10);
    expect(usage?.outputTokens).toBe(5);
  });

  it('splits system messages into the system param', async () => {
    // We can't directly inspect the SDK call args here, but we ensure no
    // error chunk is produced when system messages are mixed in.
    const chunks = [];
    for await (const c of p.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: 'You are a translator.' },
        { role: 'user', content: 'hi' },
      ],
    })) {
      chunks.push(c);
    }
    expect(chunks.some(c => c.type === 'error')).toBe(false);
  });

  it('testConnection returns true on success', async () => {
    expect(await p.testConnection()).toBe(true);
  });

  it('emits error chunk on stream failure', async () => {
    // Replace stream() with one that throws.
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const failing = new Anthropic({ apiKey: 'x', baseURL: 'x' });
    // The fake SDK's stream() signature only needs to be async-iterable;
    // we don't model the full MessageStream type here.
    (failing.messages as unknown as { stream: () => AsyncIterable<unknown> }).stream =
      vi.fn(() => {
        return {
          async *[Symbol.asyncIterator]() {
            throw new Error('boom');
          },
        };
      });
    // Swap the client into a fresh provider.
    const p2 = new AnthropicProvider({ id: 's1', apiKey: 'sk-test' });
    // @ts-expect-error: replace private client for test
    p2.client = failing;

    const chunks = [];
    for await (const c of p2.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }
    const err = chunks.find(c => c.type === 'error');
    expect(err).toBeDefined();
    expect(err?.error).toContain('boom');
  });
});
