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
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by `\n\n`
        let nlIdx;
        while ((nlIdx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 2);

          for (const line of frame.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;

            let json: OpenAIStreamFrame;
            try {
              json = JSON.parse(payload) as OpenAIStreamFrame;
            } catch {
              continue;
            }

            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield { type: 'text', text: delta };

            if (json.usage) {
              inputTokens = json.usage.prompt_tokens ?? inputTokens;
              outputTokens = json.usage.completion_tokens ?? outputTokens;
            }
          }
        }
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
}

function toOpenAIMessage(m: ChatMessage): { role: string; content: string } {
  return { role: m.role, content: m.content };
}
