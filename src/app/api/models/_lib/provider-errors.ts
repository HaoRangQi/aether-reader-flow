const MAX_PROVIDER_ERROR_DETAIL_LENGTH = 240;
const REDACTED = '[redacted]';

const SECRET_ASSIGNMENT_PATTERN =
  /(\b|["'?&])([A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*|authorization|x-api-key|(?:access|refresh|id)?_?token)(["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^"',\s}&]+(["']?)/gi;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{6,}\b/gi,
];

export function providerErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'unknown');
  const sanitized = truncate(redactSecrets(raw).trim() || 'unknown');
  const category = classifyProviderError(error);

  return `${category}: ${sanitized}`;
}

export function upstreamErrorMessage(status: number, detail: string): string {
  const sanitized = truncate(redactSecrets(detail).trim() || 'No response body');

  return `HTTP ${status}: ${sanitized}`;
}

function redactSecrets(value: string): string {
  const withRedactedAssignments = value.replace(
    SECRET_ASSIGNMENT_PATTERN,
    (_match, prefix: string, key: string, separator: string, suffix: string) =>
      `${prefix}${key}${separator}${REDACTED}${suffix}`,
  );

  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, REDACTED),
    withRedactedAssignments,
  );
}

function truncate(value: string): string {
  if (value.length <= MAX_PROVIDER_ERROR_DETAIL_LENGTH) return value;

  return `${value.slice(0, MAX_PROVIDER_ERROR_DETAIL_LENGTH)}...`;
}

function classifyProviderError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();

    if (name === 'aborterror' || name === 'timeouterror' || message.includes('timeout')) {
      return 'Provider request timed out';
    }

    if (
      error instanceof TypeError ||
      message.includes('fetch failed') ||
      message.includes('network')
    ) {
      return 'Provider network error';
    }
  }

  return 'Provider request failed';
}
