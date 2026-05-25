/**
 * POST /api/models/test
 *
 * Tests an AI provider's credentials before persisting. Body:
 *   { protocol, baseUrl, apiKey }
 *
 * Returns 200 on success, 400/500 with a JSON error on failure.
 *
 * For Anthropic we send a 1-token ping to /v1/messages.
 * For OpenAI-compatible we just GET /models — cheaper than a chat completion.
 */
import { NextResponse } from 'next/server';
import { providerErrorMessage, upstreamErrorMessage } from '../_lib/provider-errors';

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
    return NextResponse.json({ error: 'apiKey and baseUrl required' }, { status: 400 });
  }
  if (!isProviderProtocol(rawBody.protocol)) {
    return NextResponse.json({ error: 'Invalid provider protocol' }, { status: 400 });
  }
  const protocol = rawBody.protocol;
  const cleanBase = baseUrl.replace(/\/+$/, '');

  try {
    if (protocol === 'anthropic') {
      const res = await fetch(`${cleanBase}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: upstreamErrorMessage(res.status, await res.text()) },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true });
    }
    // openai-compatible
    const res = await fetch(`${cleanBase}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: upstreamErrorMessage(res.status, await res.text()) },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: providerErrorMessage(e) },
      { status: 500 },
    );
  }
}
