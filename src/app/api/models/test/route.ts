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
import { readProviderRequest } from '../_lib/request';

export async function POST(req: Request) {
  const parsed = await readProviderRequest(req, {
    missingFieldsMessage: 'apiKey and baseUrl required',
  });
  if ('error' in parsed) return parsed.error;
  const { protocol, baseUrl, apiKey } = parsed.body;
  const cleanBase = baseUrl;

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
