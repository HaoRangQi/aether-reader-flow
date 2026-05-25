/** POST /api/ai/summarize — NDJSON stream of ChatChunk. */
import type { NextRequest } from 'next/server';
import { buildSummarizePrompt } from '@/lib/prompts/summarize';
import {
  readAIEnvelope,
  providerFromEnvelope,
  streamChunks,
  type AIRouteRequest,
} from '../_lib/shared';

interface SummarizeBody {
  chapterTitle: string;
  chapterContent: string;
  systemPromptOverride?: string;
}

export async function POST(req: NextRequest) {
  const parsed = await readAIEnvelope<SummarizeBody>(req);
  if ('error' in parsed) return parsed.error;
  const { env, chapterTitle, chapterContent, systemPromptOverride } = parsed as { env: AIRouteRequest } & SummarizeBody;
  if (!chapterTitle || !chapterContent) {
    return new Response('Missing chapterTitle/chapterContent', { status: 400 });
  }

  const { system: defaultSystem, user } = buildSummarizePrompt({ chapterTitle, chapterContent });
  const system = systemPromptOverride?.trim() || defaultSystem;
  const provider = providerFromEnvelope(env);
  return streamChunks(
    provider.chat({
      modelId: env.modelId,
      maxTokens: env.maxTokens ?? 3000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  );
}
