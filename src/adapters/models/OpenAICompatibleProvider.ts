/**
 * @fileoverview OpenAICompatibleProvider — covers OpenAI itself plus the
 * 90%+ of third-party / passthrough services that speak the same protocol
 * (DeepSeek, OpenRouter, 硅基流动, Kimi, local Ollama with `OPENAI_API_BASE`,
 * etc.).
 *
 * Uses raw `fetch` + SSE parser rather than `openai` SDK because:
 *   - Avoids a heavy peer dep when we only need streaming text + usage
 *   - SDK behavior across third-party endpoints is inconsistent
 *
 * SSE protocol: server sends `data: <json>\n\n` frames. We parse each frame
 * with a small state machine, emit `text` chunks as deltas come, and watch
 * for `usage` in the final frame (OpenAI sends usage in a separate frame
 * after `stream_options: { include_usage: true }`).
 */
import type {
  ChatRequest,
  ChatMessage,
  ModelProvider,
} from './types';
import type { ChatChunk } from '@/types/api';
import type { ModelInfo } from '@/types/domain';
import { getPricing } from '@/lib/pricing';

export interface OpenAICompatOptions {
  id: string;
  baseUrl: string;
  apiKey: string;
}

interface OpenAIStreamFrame {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly protocol = 'openai' as const;
  readonly baseUrl: string;
  protected apiKey: string;

  constructor(opts: OpenAICompatOptions) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.modelId,
          messages: req.messages.map(toOpenAIMessage),
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        yield { type: 'error', error: `HTTP ${res.status}: ${text || res.statusText}` };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
        } else {
          buffer += decoder.decode(value, { stream: true });
        }

        const drained = drainSseFrames(buffer, done);
        buffer = drained.remaining;

        for (const frame of drained.frames) {
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;

          if (parsed.delta) yield { type: 'text', text: parsed.delta };

          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
            outputTokens = parsed.usage.completion_tokens ?? outputTokens;
          }
        }

        if (done) break;
      }

      yield { type: 'usage', inputTokens, outputTokens };
    } catch (e) {
      yield {
        type: 'error',
        error: e instanceof Error ? e.message : 'OpenAI-compat stream failed',
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch the model catalog via `GET /v1/models`. The OpenAI-style response
   * is `{ data: [{ id, object, owned_by, ... }] }`. Vendors disagree on
   * extra fields; we extract just `id` and synthesize the rest.
   *
   * Falls back to an empty array on any error — caller should handle by
   * letting the user input model ids manually.
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      return (json.data ?? [])
        .filter(m => typeof m.id === 'string')
        .map(m => ({
          id: m.id,
          name: m.id,
          // Unknown — caller should treat 0 as "use model default".
          contextWindow: 0,
          // Conservative: assume web search is NOT supported on
          // OpenAI-compat endpoints; verify task should skip these.
          supportsWebSearch: false,
          pricing: getPricing(m.id),
        }));
    } catch {
      return [];
    }
  }
}

function toOpenAIMessage(m: ChatMessage): { role: string; content: string } {
  return { role: m.role, content: m.content };
}

function drainSseFrames(buffer: string, flush: boolean): { frames: string[]; remaining: string } {
  const frames: string[] = [];
  let remaining = buffer;

  while (true) {
    const lfIndex = remaining.indexOf('\n\n');
    const crlfIndex = remaining.indexOf('\r\n\r\n');
    const indexes = [lfIndex, crlfIndex].filter(index => index >= 0);
    if (indexes.length === 0) break;

    const frameEnd = Math.min(...indexes);
    const separatorLength = frameEnd === crlfIndex ? 4 : 2;
    frames.push(remaining.slice(0, frameEnd));
    remaining = remaining.slice(frameEnd + separatorLength);
  }

  if (flush && remaining.trim()) {
    frames.push(remaining);
    remaining = '';
  }

  return { frames, remaining };
}

function parseSseFrame(frame: string): {
  delta?: string;
  usage?: OpenAIStreamFrame['usage'];
} | null {
  let parsed: OpenAIStreamFrame | null = null;

  for (const line of frame.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return null;

    try {
      parsed = JSON.parse(payload) as OpenAIStreamFrame;
    } catch {
      return null;
    }
  }

  if (!parsed) return null;
  return {
    delta: parsed.choices?.[0]?.delta?.content,
    usage: parsed.usage,
  };
}
