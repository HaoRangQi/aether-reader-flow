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

const MAX_OUTPUT_TOKENS = 200_000;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const SENSITIVE_ERROR_PATTERNS = [
  /\b(api[-_ ]?key|authorization|bearer|password|secret|token)\b/i,
  /\bsk-[A-Za-z0-9_-]{6,}\b/,
];

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

function headerOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function requestOrigin(req: NextRequest): { origin: string | null; invalid: boolean } {
  const origin = req.headers.get('origin');
  if (origin) {
    const parsed = headerOrigin(origin);
    return { origin: parsed, invalid: parsed === null };
  }
  const referer = req.headers.get('referer');
  if (!referer) return { origin: null, invalid: false };
  const parsed = headerOrigin(referer);
  return { origin: parsed, invalid: parsed === null };
}

function isSameOrigin(req: NextRequest): boolean {
  const { origin, invalid } = requestOrigin(req);
  if (invalid) return false;
  if (!origin) return true;
  return origin === req.nextUrl.origin;
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (CONTROL_CHAR_PATTERN.test(trimmed)) return null;
  return trimmed.length > 0 ? trimmed : null;
}

function validBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isSafeStreamError(message: string): boolean {
  return !SENSITIVE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function streamErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'stream-internal-error';
  return isSafeStreamError(error.message)
    ? error.message
    : 'AI stream failed';
}

/** Parse + validate the AI envelope, returning a typed object or 400. */
export async function readAIEnvelope<T>(
  req: NextRequest,
): Promise<({ env: AIRouteRequest } & T) | { error: Response }> {
  if (!isSameOrigin(req)) {
    return { error: new Response('Forbidden origin', { status: 403 }) };
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: new Response('Invalid JSON body', { status: 400 }) };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: new Response('Invalid AI envelope', { status: 400 }),
    };
  }
  const env = body as Record<string, unknown>;
  const serviceId = nonBlankString(env.serviceId);
  const modelId = nonBlankString(env.modelId);
  const baseUrl = nonBlankString(env.baseUrl);
  const apiKey = nonBlankString(env.apiKey);
  const parsedBaseUrl = baseUrl ? validBaseUrl(baseUrl) : null;
  if (
    serviceId === null ||
    modelId === null ||
    (env.protocol !== 'anthropic' && env.protocol !== 'openai') ||
    parsedBaseUrl === null ||
    apiKey === null
  ) {
    return {
      error: new Response('Missing required AI envelope fields', { status: 400 }),
    };
  }
  if (
    env.maxTokens !== undefined &&
    (!Number.isInteger(env.maxTokens) ||
      (env.maxTokens as number) < 1 ||
      (env.maxTokens as number) > MAX_OUTPUT_TOKENS)
  ) {
    return {
      error: new Response('Invalid AI envelope fields', { status: 400 }),
    };
  }
  if (env.webSearch !== undefined && typeof env.webSearch !== 'boolean') {
    return {
      error: new Response('Invalid AI envelope fields', { status: 400 }),
    };
  }
  return {
    ...(env as T),
    env: {
      ...(env as unknown as AIRouteRequest),
      serviceId,
      modelId,
      baseUrl: parsedBaseUrl,
      apiKey,
    },
  };
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
          error: streamErrorMessage(e),
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
