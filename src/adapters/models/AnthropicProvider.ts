/**
 * @fileoverview AnthropicProvider — `ModelProvider` impl over Anthropic's
 * Messages API. Runs server-side only (uses the secret API key directly).
 *
 * Streaming contract (from `ModelProvider.chat`):
 *   - Emits `text` chunks as content arrives
 *   - Emits exactly one `usage` chunk just before close
 *   - Emits one `error` chunk and stops on failure
 *
 * Web search support (`webSearch: true` on the request) is implemented in
 * T2.6 via `ClaudeWebSearchProvider` (a thin wrapper that injects the
 * `web_search_*` tool). This base provider does NOT honor `webSearch`;
 * callers wanting web search must use the wrapper.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatMessage,
  ChatRequest,
  ModelProvider,
} from './types';
import type { ModelInfo } from '@/types/domain';
import type { ChatChunk } from '@/types/api';

export interface AnthropicProviderOptions {
  /** ID — should match a stored `ModelService.id`. */
  id: string;
  baseUrl?: string;
  apiKey: string;
}

export class AnthropicProvider implements ModelProvider {
  readonly id: string;
  readonly protocol = 'anthropic' as const;
  readonly baseUrl: string;
  protected client: Anthropic;

  constructor(opts: AnthropicProviderOptions) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl ?? 'https://api.anthropic.com';
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: this.baseUrl,
    });
  }

  /**
   * Stream chat completions as `ChatChunk` async iterable.
   *
   * We extract the system message (Anthropic uses a separate `system`
   * param, not a role in the messages array).
   */
  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    try {
      const { system, messages } = splitSystem(req.messages);
      const stream = this.client.messages.stream({
        model: req.modelId,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
        system,
        messages,
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
        if (event.type === 'message_start' && 'message' in event) {
          // message_start carries cumulative usage so far
          const usage = (event.message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
          if (usage) {
            inputTokens = usage.input_tokens ?? 0;
            outputTokens = usage.output_tokens ?? 0;
          }
        }
        if (event.type === 'message_delta') {
          const usage = (event as { usage?: { output_tokens?: number } }).usage;
          if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
        }
      }

      yield { type: 'usage', inputTokens, outputTokens };
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : 'Anthropic stream failed' };
    }
  }

  /**
   * Validate credentials by sending a 1-token throwaway request.
   * Returns false on any error.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch the list of models the user's API key has access to via
   * Anthropic's `GET /v1/models` endpoint (added 2024). Pricing /
   * context-window data is filled from our static table; the API only
   * returns id + name + type.
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'x-api-key': (this.client as unknown as { apiKey: string }).apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: Array<{ id: string; display_name?: string }>;
      };
      return (json.data ?? []).map(m => ({
        id: m.id,
        name: m.display_name ?? m.id,
        contextWindow: m.id.includes('opus')
          ? 200_000
          : m.id.includes('haiku')
            ? 200_000
            : 200_000,
        // All Claude models support tool_use and thus web_search via tool.
        supportsWebSearch: true,
        pricing: pricingFor(m.id),
      }));
    } catch {
      return [];
    }
  }
}

/** Pull pricing from the built-in table; falls back to safe defaults. */
function pricingFor(modelId: string): { input: number; output: number } {
  // The `pricing` table import would create a circular dep at module load
  // because pricing.ts has no deps; we do a dynamic require-style lookup
  // through a static map kept here instead. Keep this map in sync with
  // `src/lib/pricing.ts` (it's tiny).
  const KNOWN: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'claude-haiku-4-5': { input: 0.8, output: 4.0 },
    'claude-opus-4-7': { input: 15.0, output: 75.0 },
  };
  return KNOWN[modelId.toLowerCase()] ?? { input: 1.0, output: 5.0 };
}

/** Splits leading system message(s) out of a flat ChatMessage[] array. */
function splitSystem(
  messages: ChatMessage[],
): {
  system: string | undefined;
  messages: { role: 'user' | 'assistant'; content: string }[];
} {
  const sys: string[] = [];
  const rest: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      sys.push(m.content);
    } else {
      rest.push({ role: m.role, content: m.content });
    }
  }
  return { system: sys.length ? sys.join('\n\n') : undefined, messages: rest };
}
