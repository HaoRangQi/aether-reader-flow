import { NextResponse } from 'next/server';

export type ProviderProtocol = 'anthropic' | 'openai';

export interface ProviderRequestBody {
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
}

interface ReadProviderRequestOptions {
  missingFieldsMessage: string;
}

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

function headerOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function getRequestHeader(req: Request, name: string): string | null {
  try {
    return req.headers.get(name);
  } catch {
    return null;
  }
}

function requestUrlOrigin(req: Request): string | null {
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}

function requestOrigin(req: Request): { origin: string | null; invalid: boolean } {
  const origin = getRequestHeader(req, 'origin');
  if (origin) {
    const parsed = headerOrigin(origin);
    return { origin: parsed, invalid: parsed === null };
  }

  const referer = getRequestHeader(req, 'referer');
  if (!referer) return { origin: null, invalid: false };
  const parsed = headerOrigin(referer);
  return { origin: parsed, invalid: parsed === null };
}

function isSameOrigin(req: Request): boolean {
  const { origin, invalid } = requestOrigin(req);
  if (invalid) return false;
  if (!origin) return true;

  const currentOrigin = requestUrlOrigin(req);
  return currentOrigin !== null && origin === currentOrigin;
}

function nonBlankString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (CONTROL_CHAR_PATTERN.test(trimmed)) return null;
  return trimmed.length > 0 ? trimmed : null;
}

function validBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isProviderProtocol(value: unknown): value is ProviderProtocol {
  return value === 'anthropic' || value === 'openai';
}

export async function readProviderRequest(
  req: Request,
  options: ReadProviderRequestOptions,
): Promise<{ body: ProviderRequestBody } | { error: NextResponse }> {
  if (!isSameOrigin(req)) {
    return { error: NextResponse.json({ error: 'Forbidden origin' }, { status: 403 }) };
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }

  const rawBody = body as Record<string, unknown>;
  const baseUrl = nonBlankString(rawBody.baseUrl);
  const apiKey = nonBlankString(rawBody.apiKey);
  if (!apiKey || !baseUrl) {
    return {
      error: NextResponse.json(
        { error: options.missingFieldsMessage },
        { status: 400 },
      ),
    };
  }

  if (!isProviderProtocol(rawBody.protocol)) {
    return {
      error: NextResponse.json(
        { error: 'Invalid provider protocol' },
        { status: 400 },
      ),
    };
  }

  const parsedBaseUrl = validBaseUrl(baseUrl);
  if (!parsedBaseUrl) {
    return { error: NextResponse.json({ error: 'Invalid baseUrl' }, { status: 400 }) };
  }

  return {
    body: {
      protocol: rawBody.protocol,
      baseUrl: parsedBaseUrl,
      apiKey,
    },
  };
}
