/**
 * @fileoverview AnthropicWebSearchProvider — Anthropic provider that also
 * exposes the `web_search` tool to the model.
 *
 * When the model decides to invoke the tool, Anthropic handles the search
 * internally and feeds results back into the conversation transparently.
 * Citations show up as `citations` on text deltas (newer API) or inside
 * the final text. The verify prompt asks the model to emit a JSON envelope
 * with sources, so we don't need to parse Anthropic's citation format —
 * we just stream text and let the model's structured output do the work.
 *
 * For details: https://docs.claude.com/en/docs/build-with-claude/tool-use
 */
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider, type AnthropicProviderOptions } from './AnthropicProvider';
import type { ChatRequest } from './types';
import type { ChatChunk } from '@/types/api';

/**
 * Anthropic's official web search tool spec. Currently `web_search_20250305`;
 * keep this constant in one place so a future tool-version bump is one edit.
 */
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search',
  max_uses: 5,
};

export class AnthropicWebSearchProvider extends AnthropicProvider {
  constructor(opts: AnthropicProviderOptions) {
    super(opts);
  }

  /**
   * Same as the parent's `chat()` but enables the web_search tool when
   * `req.webSearch === true`. The tool is server-side managed by
   * Anthropic — we don't have to parse tool_use blocks ourselves.
   */
  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    if (!req.webSearch) {
      // Fast-path: identical to parent.
      yield* super.chat(req);
      return;
    }

    try {
      const { system, messages } = splitSystem(req.messages);
      // The SDK types may lag behind the actual API surface for newer
      // tool definitions; cast through `as` to silence TS without disabling
      // strictness elsewhere.
      const stream = this.client.messages.stream({
        model: req.modelId,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        tools: [WEB_SEARCH_TOOL],
      } as unknown as Parameters<Anthropic['messages']['stream']>[0]);

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
        if (event.type === 'content_block_start') {
          const block = (event as { content_block?: { type?: string } }).content_block;
          if (block?.type === 'server_tool_use' || block?.type === 'tool_use') {
            yield { type: 'tool_use' };
          }
        }
        if (event.type === 'message_start' && 'message' in event) {
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
      yield { type: 'error', error: e instanceof Error ? e.message : 'web-search stream failed' };
    }
  }
}

function splitSystem(messages: { role: string; content: string }[]) {
  const sys: string[] = [];
  const rest: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
  for (const m of messages) {
    if (m.role === 'system') sys.push(m.content);
    else rest.push(m as { role: 'user' | 'assistant'; content: string });
  }
  return { system: sys.length ? sys.join('\n\n') : undefined, messages: rest };
}
