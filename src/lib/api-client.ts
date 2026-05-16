/**
 * Thin fetch wrapper for `/api/*` calls. Throws on non-2xx.
 *
 * Why a wrapper:
 *   - Keeps `Content-Type` header and JSON encoding in one place
 *   - Centralizes error message formatting so UI components can `try {} catch`
 *     without parsing response bodies
 */
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}
