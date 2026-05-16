/**
 * POST /api/ai/translate
 * Streams an NDJSON of ChatChunk for the translate task.
 */
import type { NextRequest } from 'next/server';
import { buildTranslatePrompt } from '@/lib/prompts/translate';
import {
  readAIEnvelope,
  providerFromEnvelope,
  streamChunks,
  type AIRouteRequest,
} from '../_lib/shared';

interface TranslateBody {
  text: string;
}

export async function POST(req: NextRequest) {
  const parsed = await readAIEnvelope<TranslateBody>(req);
  if ('error' in parsed) return parsed.error;
  const { env, text } = parsed as { env: AIRouteRequest } & TranslateBody;
  if (typeof text !== 'string' || !text.trim()) {
    return new Response('Missing text', { status: 400 });
  }

  const { system, user } = buildTranslatePrompt({ text });
  const provider = providerFromEnvelope(env);
  return streamChunks(
    provider.chat({
      modelId: env.modelId,
      maxTokens: env.maxTokens ?? 800,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  );
}
