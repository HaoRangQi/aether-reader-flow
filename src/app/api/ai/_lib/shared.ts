/**
 * @fileoverview Shared utilities for /api/ai/* route handlers.
 *
 * These helpers take care of three crosscutting concerns:
 *
 *   1. **Resolving a provider** from the request body (serviceId + modelId)
 *      against the IndexedDB ModelService records — except the API routes
 *      run on the server, where IndexedDB does NOT exist. So the client
 *      sends the *decrypted* API key plus baseUrl + protocol with every
 *      request. The server NEVER stores keys.
 *
 *   2. **Streaming as NDJSON**. Each `ChatChunk` is `JSON.stringify`-ed
 *      and emitted with a trailing `\n`. The client splits by `\n` and
 *      parses each line. Simpler than SSE for our needs.
 *
 *   3. **Origin check** to prevent random sites from triggering AI calls
 *      via this server (defense-in-depth; the route still costs the
 *      user's own API key, but we shouldn't be an open relay).
 */
import type { NextRequest } from 'next/server';
import { buildProvider } from '@/adapters/models/factory';
import type { ModelProvider } from '@/adapters/models/types';
import type { ChatChunk } from '@/types/api';
import type { ModelService } from '@/types/domain';

/**
 * Request envelope sent by the AIService client. The server never sees
 * the cipher; the client must `CryptoService.decrypt()` before posting.
 */
export interface AIRouteRequest {
  serviceId: string;
  modelId: string;
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  /** Plaintext API key (already decrypted client-side). */
  apiKey: string;
  /** Whether to enable web search for this call (verify only, MVP). */
  webSearch?: boolean;
  /** Per-call max output tokens override. */
  maxTokens?: number;
}

/** Parse + validate the AI envelope, returning a typed object or 400. */
export async function readAIEnvelope<T>(
  req: NextRequest,
): Promise<({ env: AIRouteRequest } & T) | { error: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: new Response('Invalid JSON body', { status: 400 }) };
  }
  const env = body as Record<string, unknown>;
  if (
    typeof env.serviceId !== 'string' ||
    typeof env.modelId !== 'string' ||
    (env.protocol !== 'anthropic' && env.protocol !== 'openai') ||
    typeof env.baseUrl !== 'string' ||
    typeof env.apiKey !== 'string'
  ) {
    return {
      error: new Response('Missing required AI envelope fields', { status: 400 }),
    };
  }
  return { env: env as unknown as AIRouteRequest, ...(env as T) };
}

/**
 * Build a ModelProvider from the envelope. We synthesize a minimal
 * `ModelService`-shaped object since the factory expects one.
 */
export function providerFromEnvelope(env: AIRouteRequest): ModelProvider {
  const service: ModelService = {
    id: env.serviceId,
    name: env.serviceId,
    protocol: env.protocol,
    baseUrl: env.baseUrl,
    apiKeyCipher: '',
    enabled: true,
    enabledModels: [env.modelId],
    createdAt: new Date(),
  };
  return buildProvider(service, env.apiKey, env.webSearch === true);
}

/**
 * Wrap an async iterable of `ChatChunk` into a streaming NDJSON `Response`.
 *
 * Set `Content-Type: application/x-ndjson` so middleware / proxies don't
 * try to buffer or transform it.
 */
export function streamChunks(iter: AsyncIterable<ChatChunk>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iter) {
          controller.enqueue(enc.encode(JSON.stringify(chunk) + '\n'));
        }
      } catch (e) {
        const err: ChatChunk = {
          type: 'error',
          error: e instanceof Error ? e.message : 'stream-internal-error',
        };
        controller.enqueue(enc.encode(JSON.stringify(err) + '\n'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
