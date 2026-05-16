/** POST /api/ai/chat — NDJSON stream of ChatChunk for follow-up dialogue. */
import type { NextRequest } from 'next/server';
import { buildChatSystemPrompt } from '@/lib/prompts/chat';
import {
  readAIEnvelope,
  providerFromEnvelope,
  streamChunks,
  type AIRouteRequest,
} from '../_lib/shared';
import type { TaskType } from '@/types/domain';

interface ChatBody {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  anchor?: { originalText: string; type: TaskType };
}

export async function POST(req: NextRequest) {
  const parsed = await readAIEnvelope<ChatBody>(req);
  if ('error' in parsed) return parsed.error;
  const { env, history, anchor } = parsed as { env: AIRouteRequest } & ChatBody;
  if (!Array.isArray(history) || history.length === 0) {
    return new Response('Missing history', { status: 400 });
  }

  const system = buildChatSystemPrompt({
    anchorText: anchor?.originalText,
    anchorType: anchor?.type,
  });

  const provider = providerFromEnvelope(env);
  return streamChunks(
    provider.chat({
      modelId: env.modelId,
      maxTokens: env.maxTokens ?? 2000,
      messages: [
        { role: 'system', content: system },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  );
}
