/**
 * Thin fetch wrapper for `/api/*` calls. Throws on non-2xx.
 *
 * Why a wrapper:
 *   - Keeps `Content-Type` header and JSON encoding in one place
 *   - Centralizes error message formatting so UI components can `try {} catch`
 *     without parsing response bodies
 */
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const safePath = formatApiErrorPath(path);
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`API ${safePath} request failed: ${formatApiTransportError(error)}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${safePath} failed (${res.status}): ${formatApiErrorBody(text)}`);
  }
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`API ${safePath} returned invalid JSON (${res.status})`);
  }
}

const MAX_ERROR_BODY_CHARS = 500;
const SENSITIVE_QUERY_KEYS = new Set(['apikey', 'api_key', 'authorization', 'token', 'access_token']);

function formatApiErrorPath(path: string): string {
  try {
    const url = new URL(path, 'http://localhost');
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path
      .replace(/([?&](?:apiKey|api_key|authorization|token|access_token)=)[^&#\s]+/gi, '$1[redacted]')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

function formatApiErrorBody(body: string): string {
  const redacted = body
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[redacted-api-key]')
    .replace(/("(?:apiKey|api_key|authorization|token)"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3')
    .replace(/\s+/g, ' ')
    .trim();

  if (!redacted) return 'Empty error response';
  if (redacted.length <= MAX_ERROR_BODY_CHARS) return redacted;
  return `${redacted.slice(0, MAX_ERROR_BODY_CHARS)}…`;
}

function formatApiTransportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return formatApiErrorBody(message || 'Network request failed');
}
