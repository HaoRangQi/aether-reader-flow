/**
 * POST /api/ai/verify — NDJSON stream of ChatChunk with web_search enabled.
 *
 * The route always passes `webSearch: true` to the provider regardless of
 * the envelope's `webSearch` flag, because verify only makes sense with
 * search. The model is prompted to emit a JSON envelope in the final
 * `text` chunks; the client parses it (see AIService).
 */
import type { NextRequest } from 'next/server';
import { buildVerifyPrompt } from '@/lib/prompts/verify';
import {
  readAIEnvelope,
  providerFromEnvelope,
  streamChunks,
  type AIRouteRequest,
} from '../_lib/shared';

interface VerifyBody {
  text: string;
  context: string;
}

export async function POST(req: NextRequest) {
  const parsed = await readAIEnvelope<VerifyBody>(req);
  if ('error' in parsed) return parsed.error;
  const { env, text, context } = parsed as { env: AIRouteRequest } & VerifyBody;
  if (!text || !context) return new Response('Missing text/context', { status: 400 });

  const { system, user } = buildVerifyPrompt({ text, context });
  const provider = providerFromEnvelope({ ...env, webSearch: true });
  return streamChunks(
    provider.chat({
      modelId: env.modelId,
      maxTokens: env.maxTokens ?? 4000,
      webSearch: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  );
}
