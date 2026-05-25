/**
 * @fileoverview ClaudeWebSearchProvider — `SearchProvider` impl that
 * delegates to Anthropic's built-in web_search tool.
 *
 * In MVP we don't use this directly — `verify` queries go through the
 * AI as a normal chat with `webSearch: true`, and the model surfaces
 * results inside its response. This abstraction exists for future
 * features that want to issue a raw search call (e.g., a "find sources
 * on this concept" sidebar action).
 *
 * Implementation note: rather than make a real search API call, we
 * one-shot the model with a system prompt that asks ONLY for JSON
 * sources. The response is parsed into `SourceRef[]`. This keeps the
 * interface honest while reusing Anthropic's hosted search.
 */
import { AnthropicWebSearchProvider } from '@/adapters/models/AnthropicWebSearchProvider';
import type { SourceRef } from '@/types/domain';
import type { SearchProvider } from './types';

const SEARCH_SYSTEM_PROMPT = `You are a search agent. Use the web_search tool to find recent, authoritative sources for the user's query. Return ONLY a JSON array of objects with keys "url", "title", "snippet", "publishedAt" (ISO date if known). Do not include any prose. Maximum 8 results.`;

export interface ClaudeWebSearchOptions {
  id: string;
  baseUrl?: string;
  apiKey: string;
  modelId?: string;
}

export class ClaudeWebSearchProvider implements SearchProvider {
  readonly id: string;
  private provider: AnthropicWebSearchProvider;
  private modelId: string;

  constructor(opts: ClaudeWebSearchOptions) {
    this.id = opts.id;
    this.modelId = opts.modelId ?? 'claude-sonnet-4-6';
    this.provider = new AnthropicWebSearchProvider({
      id: opts.id,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
    });
  }

  async search(query: string): Promise<SourceRef[]> {
    let buffer = '';
    for await (const chunk of this.provider.chat({
      modelId: this.modelId,
      webSearch: true,
      messages: [
        { role: 'system', content: SEARCH_SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
    })) {
      if (chunk.type === 'text' && chunk.text) buffer += chunk.text;
      if (chunk.type === 'error') {
        throw new Error(chunk.error ?? 'search failed');
      }
    }
    return parseSourcesFromJSON(buffer);
  }
}

/**
 * Best-effort JSON extraction. The model may wrap the array in markdown
 * fences or add prose despite our prompt; we look for the first `[ ... ]`.
 */
export function parseSourcesFromJSON(text: string): SourceRef[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map(normalizeSourceRef)
      .filter((item): item is SourceRef => item !== null);
  } catch {
    return [];
  }
}

function normalizeSourceRef(item: unknown): SourceRef | null {
  if (!item || typeof item !== 'object') return null;
  const source = item as Record<string, unknown>;
  const { url: rawUrl, title: rawTitle, snippet: rawSnippet, publishedAt } = source;
  if (typeof rawUrl !== 'string' || typeof rawTitle !== 'string') return null;
  const url = normalizeHttpUrl(rawUrl);
  const title = rawTitle.trim();
  const snippet = typeof rawSnippet === 'string' ? rawSnippet.trim() : '';
  const publishedAtString = typeof publishedAt === 'string' ? publishedAt : undefined;
  if (!url || !title) return null;

  return {
    url,
    title,
    snippet,
    publishedAt: normalizePublishedAt(publishedAtString),
  };
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizePublishedAt(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
