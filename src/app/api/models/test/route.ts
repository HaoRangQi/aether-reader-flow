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
    return NextResponse.json({ error: 'apiKey and baseUrl required' }, { status: 400 });
  }
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
          { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` },
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
        { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
