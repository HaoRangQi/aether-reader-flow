/**
 * @fileoverview ModelProvider — the abstraction every AI call goes through.
 *
 * The hexagonal architecture's purpose is realized here: business logic
 * (AIService, prompts, task routing) depends ONLY on `ModelProvider`. A
 * future swap from Anthropic to GPT/local-Ollama means writing a new
 * provider class — nothing else changes.
 *
 * ## Streaming contract
 *
 * `chat()` returns an async iterable of `ChatChunk` (see `@/types/api`).
 * Implementations MUST:
 *   - Emit `text` chunks for incremental output
 *   - Emit exactly one `usage` chunk at the end with input/output token counts
 *   - Emit one `error` chunk and stop on failure (do not throw mid-stream)
 *
 * This keeps the consumer code uniform across providers and protocols.
 */
import type { ModelInfo, TaskType } from '@/types/domain';
import type { ChatChunk } from '@/types/api';

/** A message in the chat history. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Arguments to `ModelProvider.chat()`. */
export interface ChatRequest {
  modelId: string;
  messages: ChatMessage[];
  /** Max output tokens. Provider should cap at model's actual context. */
  maxTokens?: number;
  /** 0–1. Defaults provider-specific. */
  temperature?: number;
  /**
   * If true, the provider should enable web search (assuming the model
   * supports it; otherwise this flag is ignored).
   */
  webSearch?: boolean;
}

export interface ModelProvider {
  /** Stable id; matches a `ModelService.id` from storage. */
  id: string;
  protocol: 'anthropic' | 'openai';
  baseUrl: string;

  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  testConnection(): Promise<boolean>;

  /**
   * Optional: list models the user can pick from. Only some providers
   * expose a usable `GET /v1/models` endpoint; for others, the user types
   * a model id manually in settings.
   */
  listModels?(): Promise<ModelInfo[]>;
}

export type { TaskType };
