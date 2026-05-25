import { describe, expect, it } from 'vitest';
import { providerErrorMessage, upstreamErrorMessage } from './provider-errors';

describe('provider error formatting', () => {
  it('redacts secrets from query strings, JSON fields, and headers', () => {
    const message = upstreamErrorMessage(
      401,
      [
        'https://provider.example.com/models?apiKey=sk-secret-value-123456789&safe=1',
        '{"access_token":"short1","x-api-key":"sk-provider-secret-123456789"}',
        'Authorization: Bearer token1',
      ].join(' '),
    );

    expect(message).toContain('HTTP 401:');
    expect(message).toContain('apiKey=[redacted]');
    expect(message).toContain('"access_token":"[redacted]"');
    expect(message).toContain('"x-api-key":"[redacted]"');
    expect(message).toContain('Authorization: [redacted]');
    expect(message).not.toContain('sk-secret-value-123456789');
    expect(message).not.toContain('sk-provider-secret-123456789');
    expect(message).not.toContain('short1');
    expect(message).not.toContain('token1');
  });

  it('classifies timeout, network, fallback, and null errors consistently', () => {
    const timeout = new DOMException('timeout Authorization=Bearer short1', 'AbortError');
    const network = new TypeError('fetch failed access_token=short2');

    expect(providerErrorMessage(timeout)).toBe(
      'Provider request timed out: timeout Authorization=[redacted]',
    );
    expect(providerErrorMessage(network)).toBe(
      'Provider network error: fetch failed access_token=[redacted]',
    );
    expect(providerErrorMessage(new Error('plain failure'))).toBe(
      'Provider request failed: plain failure',
    );
    expect(providerErrorMessage(null)).toBe('Provider request failed: unknown');
  });

  it('truncates long sanitized details after redaction', () => {
    const message = providerErrorMessage(
      new Error(`provider failed token=short3 ${'x'.repeat(400)}`),
    );

    expect(message).toMatch(/^Provider request failed: provider failed token=\[redacted\] x+\.\.\.$/);
    expect(message.length).toBeLessThanOrEqual(268);
    expect(message).not.toContain('short3');
  });

  it('uses a stable fallback for empty upstream response bodies', () => {
    expect(upstreamErrorMessage(500, '   ')).toBe('HTTP 500: No response body');
  });
});
