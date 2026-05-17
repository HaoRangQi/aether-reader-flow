/**
 * POST /api/models/list
 *
 * Calls the provider's "list models" endpoint and returns the catalog.
 * Body:
 *   { protocol: 'anthropic' | 'openai', baseUrl, apiKey }
 *
 * Response on success:
 *   { models: ModelInfo[] }
 *
 * The client uses this to render checkbox lists instead of asking users
 * to type model ids by hand.
 */
import { NextResponse } from 'next/server';
import { AnthropicProvider } from '@/adapters/models/AnthropicProvider';
import { OpenAICompatibleProvider } from '@/adapters/models/OpenAICompatibleProvider';

interface Body {
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  apiKey: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { protocol, baseUrl, apiKey } = body;
  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: 'apiKey 与 baseUrl 必填' },
      { status: 400 },
    );
  }

  try {
    const provider =
      protocol === 'anthropic'
        ? new AnthropicProvider({ id: 'tmp-list', baseUrl, apiKey })
        : new OpenAICompatibleProvider({ id: 'tmp-list', baseUrl, apiKey });

    const models = (await provider.listModels?.()) ?? [];
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
