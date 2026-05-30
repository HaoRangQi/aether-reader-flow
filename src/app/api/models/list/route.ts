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
import { providerErrorMessage } from '../_lib/provider-errors';
import { readProviderRequest } from '../_lib/request';

export async function POST(req: Request) {
  const parsed = await readProviderRequest(req, {
    missingFieldsMessage: 'apiKey 与 baseUrl 必填',
  });
  if ('error' in parsed) return parsed.error;
  const { protocol, baseUrl, apiKey } = parsed.body;

  try {
    const provider =
      protocol === 'anthropic'
        ? new AnthropicProvider({ id: 'tmp-list', baseUrl, apiKey })
        : new OpenAICompatibleProvider({ id: 'tmp-list', baseUrl, apiKey });

    const models = (await provider.listModels?.()) ?? [];
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: providerErrorMessage(e) },
      { status: 500 },
    );
  }
}
