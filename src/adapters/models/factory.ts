/**
 * @fileoverview Provider factory.
 *
 * Given a stored `ModelService` (with an already-decrypted API key), build
 * the right `ModelProvider` instance. Used by API routes to dispatch a
 * call without knowing which protocol is at the other end.
 */
import type { ModelService } from '@/types/domain';
import { AnthropicProvider } from './AnthropicProvider';
import { AnthropicWebSearchProvider } from './AnthropicWebSearchProvider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import type { ModelProvider } from './types';

/**
 * @param service - The user-configured service record
 * @param apiKey  - Plaintext API key (caller must decrypt it first)
 * @param withWebSearch - Whether to return a provider that enables web search
 */
export function buildProvider(
  service: ModelService,
  apiKey: string,
  withWebSearch = false,
): ModelProvider {
  if (!service.enabled) {
    throw new Error(`Model service is disabled: ${service.id}`);
  }

  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) {
    throw new Error(`Model service API key is required: ${service.id}`);
  }

  switch (service.protocol) {
    case 'anthropic':
      return withWebSearch
        ? new AnthropicWebSearchProvider({
            id: service.id,
            baseUrl: service.baseUrl,
            apiKey: normalizedApiKey,
          })
        : new AnthropicProvider({
            id: service.id,
            baseUrl: service.baseUrl,
            apiKey: normalizedApiKey,
          });
    case 'openai':
      // OpenAI-compat protocol does not (yet) have a uniform web-search
      // story across vendors. We pass through; the caller's prompt is on
      // its own to mention "you don't have web search" if necessary.
      return new OpenAICompatibleProvider({
        id: service.id,
        baseUrl: service.baseUrl,
        apiKey: normalizedApiKey,
      });
    default:
      throw new Error(`Unknown provider protocol for service: ${service.id}`);
  }
}
