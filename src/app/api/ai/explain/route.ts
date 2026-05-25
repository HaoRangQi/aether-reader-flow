/** POST /api/ai/explain — NDJSON stream of ChatChunk. */
import type { NextRequest } from 'next/server';
import { buildExplainPrompt } from '@/lib/prompts/explain';
import {
  readAIEnvelope,
  providerFromEnvelope,
  streamChunks,
  type AIRouteRequest,
} from '../_lib/shared';

interface ExplainBody {
  text: string;
  context: string;
  systemPromptOverride?: string;
}

export async function POST(req: NextRequest) {
  const parsed = await readAIEnvelope<ExplainBody>(req);
  if ('error' in parsed) return parsed.error;
  const { env, text, context, systemPromptOverride } = parsed as { env: AIRouteRequest } & ExplainBody;
  if (!text || !context) return new Response('Missing text/context', { status: 400 });

  const { system: defaultSystem, user } = buildExplainPrompt({ text, context });
  const system = systemPromptOverride?.trim() || defaultSystem;
  const provider = providerFromEnvelope(env);
  return streamChunks(
    provider.chat({
      modelId: env.modelId,
      maxTokens: env.maxTokens ?? 1500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  );
}
