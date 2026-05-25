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

interface Body {
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  apiKey: string;
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isProviderProtocol(value: unknown): value is Body['protocol'] {
  return value === 'anthropic' || value === 'openai';
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const rawBody = body as Record<string, unknown>;
  const baseUrl = nonBlankString(rawBody.baseUrl);
  const apiKey = nonBlankString(rawBody.apiKey);
  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: 'apiKey 与 baseUrl 必填' },
      { status: 400 },
    );
  }
  if (!isProviderProtocol(rawBody.protocol)) {
    return NextResponse.json(
      { error: 'Invalid provider protocol' },
      { status: 400 },
    );
  }
  const protocol = rawBody.protocol;

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
