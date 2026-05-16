/**
 * @fileoverview SearchProvider — web-search abstraction.
 *
 * Separate from `ModelProvider` because some AI calls need search and
 * others don't. P2 ships `ClaudeWebSearchProvider` which delegates to
 * the Anthropic API's built-in `web_search_20250305` tool. Later phases
 * can add Tavily/Brave/SerpAPI without changing the verify pipeline.
 */
import type { SourceRef } from '@/types/domain';

export interface SearchProvider {
  id: string;
  search(query: string): Promise<SourceRef[]>;
}
