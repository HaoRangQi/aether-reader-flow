## Phase 2: Core AI (Weeks 3-6)

Goal: Implement the 5 AI capabilities end-to-end (translate / explain / verify / summarize / chat). User can select text in the reader, trigger AI from the popover, see streaming output, and follow up in the sidebar.

Scope guardrails:
- This phase implements ModelProvider, SearchProvider, AIService, 5 prompt templates, 5 API routes, and the reader-side UI (SelectionPopover, AISidebar, ChapterSummaryPanel).
- Timeline persistence is wired (every AI call writes a TimelineEntry via `IndexedDBTimelineRepo`) but the **timeline UI** (panel, filters, search, export) is P3.
- Provider config is hard-coded for development: `.env.local` holds `ANTHROPIC_API_KEY`, and `ConfigService` seeds a single Anthropic `ModelService` + default `TaskRouting` on first run. Full Settings UI is P4.
- Theme / glass polish is intentionally minimal — components use the CSS variables from P1's globals.css but don't yet do shimmer / blur-saturate effects. P5 owns the final visual pass.
- Cost is recorded into `IndexedDBCostRepo` per AI call, but the **today / month** badges and budget UI are P4.

Note: This is the P2 draft. It assumes P1 (T1.1 - T1.14) is complete and the following names from P1 are sacred and reused exactly:
- Types: `TaskType`, `Book`, `Chapter`, `TimelineEntry`, `SourceRef`, `ModelService`, `ModelRef`, `TaskRouting`, `ModelInfo`, `ChatChunk`
- Interfaces: `ModelProvider`, `ChatRequest`, `ChatMessage` (from `src/adapters/models/types.ts`), `SearchProvider` (from `src/adapters/search/types.ts`), `BookRepo`, `ChapterRepo`, `TimelineRepo`, `ConfigRepo`, `ModelServiceRepo`, `CostRepo` (from `src/adapters/storage/interfaces.ts`)
- Components from P1 placeholders: `ReaderView`, `ChapterNav`, `ChapterContent`, `ChapterSummaryPanel`, `AISidebar`, `SelectionPopover`, `BookList`, `BookCard`, `UploadDialog`
- Stores: `readerStore`

---

### Task T2.1: AnthropicProvider — base streaming chat

**Files:**
- Create: `src/adapters/models/AnthropicProvider.ts`, `src/adapters/models/AnthropicProvider.test.ts`

- [ ] **Step 1: Write failing test `src/adapters/models/AnthropicProvider.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';

describe('AnthropicProvider.chat', () => {
  it('streams text deltas then yields usage summary', async () => {
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 7 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
      { type: 'message_delta', usage: { output_tokens: 2 } },
    ];
    const fakeStream = {
      [Symbol.asyncIterator]: async function* () { for (const e of events) yield e; },
    };
    const fakeClient = {
      messages: { stream: vi.fn().mockReturnValue(fakeStream) },
    };
    const provider = new AnthropicProvider({
      id: 's1', apiKey: 'sk-x', client: fakeClient as never,
    });
    const out: string[] = [];
    let usage = { in: 0, out: 0 };
    for await (const c of provider.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      if (c.type === 'text' && c.text) out.push(c.text);
      if (c.type === 'usage') usage = { in: c.inputTokens ?? 0, out: c.outputTokens ?? 0 };
    }
    expect(out.join('')).toBe('Hello');
    expect(usage).toEqual({ in: 7, out: 2 });
    expect(fakeClient.messages.stream).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4-6',
      max_tokens: expect.any(Number),
    }));
  });

  it('yields error chunk on exception', async () => {
    const fakeClient = {
      messages: { stream: vi.fn().mockImplementation(() => { throw new Error('boom'); }) },
    };
    const provider = new AnthropicProvider({
      id: 's1', apiKey: 'sk-x', client: fakeClient as never,
    });
    const chunks = [];
    for await (const c of provider.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }
    expect(chunks.some(c => c.type === 'error')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/adapters/models/AnthropicProvider.test.ts
```
Expected: FAIL with "Cannot find module './AnthropicProvider'".

- [ ] **Step 3: Write `src/adapters/models/AnthropicProvider.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ModelProvider, ChatRequest } from './types';
import type { ChatChunk } from '@/types/api';
import type { ModelInfo } from '@/types/domain';

interface Opts {
  id: string;
  baseUrl?: string;
  apiKey: string;
  client?: Anthropic;
}

export class AnthropicProvider implements ModelProvider {
  id: string;
  protocol: 'anthropic' = 'anthropic';
  baseUrl: string;
  protected client: Anthropic;

  constructor(opts: Opts) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl ?? 'https://api.anthropic.com';
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, baseURL: this.baseUrl });
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const system = req.messages.find(m => m.role === 'system')?.content;
      const messages = req.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const stream = this.client.messages.stream({
        model: req.modelId,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature,
        system,
        messages,
      } as never);

      for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
        const t = event.type as string | undefined;
        if (t === 'message_start') {
          const u = (event.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
          if (typeof u?.input_tokens === 'number') inputTokens = u.input_tokens;
        } else if (t === 'content_block_delta') {
          const d = event.delta as { type?: string; text?: string } | undefined;
          if (d?.type === 'text_delta' && typeof d.text === 'string') {
            yield { type: 'text', text: d.text };
          }
        } else if (t === 'message_delta') {
          const u = event.usage as { output_tokens?: number } | undefined;
          if (typeof u?.output_tokens === 'number') outputTokens = u.output_tokens;
        }
      }
      yield { type: 'usage', inputTokens, outputTokens };
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : 'anthropic error' };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const stream = this.client.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      } as never);
      for await (const _ of stream as AsyncIterable<unknown>) { break; }
      return true;
    } catch { return false; }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200_000, supportsWebSearch: true, pricing: { input: 3, output: 15 } },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200_000, supportsWebSearch: false, pricing: { input: 0.8, output: 4 } },
    ];
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/adapters/models/AnthropicProvider.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/models/AnthropicProvider.ts src/adapters/models/AnthropicProvider.test.ts
git commit -m "feat: AnthropicProvider 基础流式 chat 实现"
```

---

### Task T2.2: AnthropicProvider — web_search tool integration

Adds an optional `webSearch: true` mode that injects Anthropic's native `web_search_20250305` tool into the request. The provider passes the tool through; the verify route (T2.17) is the only caller that sets this flag. The SDK shape for tool blocks is mocked in the test; the real shape is validated end-to-end via the manual smoke test in T2.20.

Note: The exact Anthropic Web Search tool spec may evolve. If `web_search_20250305` is deprecated when implementing, use the current spec from `https://docs.anthropic.com` and keep the call site stable.

**Files:**
- Modify: `src/adapters/models/AnthropicProvider.ts`
- Modify: `src/adapters/models/AnthropicProvider.test.ts`

- [ ] **Step 1: Append failing test to `src/adapters/models/AnthropicProvider.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';

describe('AnthropicProvider.chat with webSearch', () => {
  it('passes web_search tool when webSearch=true', async () => {
    const fakeStream = { [Symbol.asyncIterator]: async function* () {} };
    const streamMock = vi.fn().mockReturnValue(fakeStream);
    const provider = new AnthropicProvider({
      id: 's1', apiKey: 'sk-x',
      client: { messages: { stream: streamMock } } as never,
    });
    for await (const _ of provider.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'verify' }],
      webSearch: true,
    })) { /* drain */ }
    const call = streamMock.mock.calls[0][0];
    expect(call.tools).toEqual([
      expect.objectContaining({ type: 'web_search_20250305', name: 'web_search' }),
    ]);
  });

  it('omits tools when webSearch is false/undefined', async () => {
    const fakeStream = { [Symbol.asyncIterator]: async function* () {} };
    const streamMock = vi.fn().mockReturnValue(fakeStream);
    const provider = new AnthropicProvider({
      id: 's1', apiKey: 'sk-x',
      client: { messages: { stream: streamMock } } as never,
    });
    for await (const _ of provider.chat({
      modelId: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'plain' }],
    })) { /* drain */ }
    const call = streamMock.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/adapters/models/AnthropicProvider.test.ts
```
Expected: 2 new tests fail.

- [ ] **Step 3: Update `src/adapters/models/AnthropicProvider.ts` `chat()` to inject tools and surface `tool_use` chunks**

Replace the inside of the `try` block in `chat()` with:

```typescript
const system = req.messages.find(m => m.role === 'system')?.content;
const messages = req.messages
  .filter(m => m.role !== 'system')
  .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

const tools = req.webSearch
  ? [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }]
  : undefined;

const stream = this.client.messages.stream({
  model: req.modelId,
  max_tokens: req.maxTokens ?? 2048,
  temperature: req.temperature,
  system,
  messages,
  tools,
} as never);

for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
  const t = event.type as string | undefined;
  if (t === 'message_start') {
    const u = (event.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
    if (typeof u?.input_tokens === 'number') inputTokens = u.input_tokens;
  } else if (t === 'content_block_start') {
    const block = event.content_block as { type?: string } | undefined;
    if (block?.type === 'tool_use' || block?.type === 'server_tool_use') {
      yield { type: 'tool_use', text: block.type };
    }
  } else if (t === 'content_block_delta') {
    const d = event.delta as { type?: string; text?: string } | undefined;
    if (d?.type === 'text_delta' && typeof d.text === 'string') {
      yield { type: 'text', text: d.text };
    }
  } else if (t === 'message_delta') {
    const u = event.usage as { output_tokens?: number } | undefined;
    if (typeof u?.output_tokens === 'number') outputTokens = u.output_tokens;
  }
}
yield { type: 'usage', inputTokens, outputTokens };
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/adapters/models/AnthropicProvider.test.ts
```
Expected: 4 passing (2 prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/models/AnthropicProvider.ts src/adapters/models/AnthropicProvider.test.ts
git commit -m "feat: AnthropicProvider 集成 web_search 工具支持"
```

---

### Task T2.3: OpenAICompatibleProvider — base streaming chat

Implements the OpenAI-compatible SSE protocol (`/chat/completions` with `stream: true` and `stream_options.include_usage: true`). Used for DeepSeek, OpenRouter, 硅基流动, local Ollama (`base_url=http://localhost:11434/v1`), etc.

**Files:**
- Create: `src/adapters/models/OpenAICompatibleProvider.ts`, `src/adapters/models/OpenAICompatibleProvider.test.ts`

- [ ] **Step 1: Write failing test `src/adapters/models/OpenAICompatibleProvider.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';

describe('OpenAICompatibleProvider.chat', () => {
  it('parses SSE deltas and trailing usage frame', async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      '',
      'data: {"usage":{"prompt_tokens":9,"completion_tokens":3}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sseBody, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const provider = new OpenAICompatibleProvider({
      id: 'svc', baseUrl: 'https://api.example.com/v1', apiKey: 'k', fetchImpl: fetchMock,
    });
    const out: string[] = [];
    let usage = { in: 0, out: 0 };
    for await (const c of provider.chat({
      modelId: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      if (c.type === 'text' && c.text) out.push(c.text);
      if (c.type === 'usage') usage = { in: c.inputTokens ?? 0, out: c.outputTokens ?? 0 };
    }
    expect(out.join('')).toBe('Hello');
    expect(usage).toEqual({ in: 9, out: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer k' }),
      }),
    );
  });

  it('yields error chunk on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('upstream broken', { status: 500 }));
    const provider = new OpenAICompatibleProvider({
      id: 'svc', baseUrl: 'https://api.example.com/v1', apiKey: 'k', fetchImpl: fetchMock,
    });
    const errs: string[] = [];
    for await (const c of provider.chat({
      modelId: 'm',
      messages: [{ role: 'user', content: 'x' }],
    })) {
      if (c.type === 'error' && c.error) errs.push(c.error);
    }
    expect(errs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/adapters/models/OpenAICompatibleProvider.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/adapters/models/OpenAICompatibleProvider.ts`**

```typescript
import type { ModelProvider, ChatRequest } from './types';
import type { ChatChunk } from '@/types/api';
import type { ModelInfo } from '@/types/domain';

type FetchImpl = typeof fetch;

interface Opts {
  id: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchImpl;
}

export class OpenAICompatibleProvider implements ModelProvider {
  id: string;
  protocol: 'openai' = 'openai';
  baseUrl: string;
  private apiKey: string;
  private fetchImpl: FetchImpl;

  constructor(opts: Opts) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    let inputTokens = 0;
    let outputTokens = 0;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.modelId,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : 'network error' };
      return;
    }

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      yield { type: 'error', error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const text = json.choices?.[0]?.delta?.content;
          if (typeof text === 'string') yield { type: 'text', text };
          if (json.usage) {
            inputTokens = json.usage.prompt_tokens ?? inputTokens;
            outputTokens = json.usage.completion_tokens ?? outputTokens;
          }
        } catch { /* skip malformed */ }
      }
    }
    yield { type: 'usage', inputTokens, outputTokens };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch { return false; }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data ?? []).map(m => ({
        id: m.id, name: m.id,
        contextWindow: 128_000, supportsWebSearch: false,
        pricing: { input: 0, output: 0 },
      }));
    } catch { return []; }
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/adapters/models/OpenAICompatibleProvider.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/models/OpenAICompatibleProvider.ts src/adapters/models/OpenAICompatibleProvider.test.ts
git commit -m "feat: OpenAICompatibleProvider 基础 SSE 流式实现"
```

---

### Task T2.4: ClaudeWebSearchProvider

A thin shim implementing `SearchProvider` by reusing `AnthropicProvider` to run a single web_search-enabled message and harvesting source citations from the response. P2 itself does not call `search()` directly — the verify route sets `webSearch: true` on the chat request and Claude returns prose with embedded citations. This provider is here so future search-only providers (Tavily, Brave) can drop in with the same interface.

Note: Extracting `SourceRef[]` from Anthropic citations requires parsing the streamed response. P2 returns `[]` and lets the verify route format sources inside the AI text response (P5 may revisit when prompt tuning surfaces structured citation needs).

**Files:**
- Create: `src/adapters/search/ClaudeWebSearchProvider.ts`, `src/adapters/search/ClaudeWebSearchProvider.test.ts`

- [ ] **Step 1: Write failing test `src/adapters/search/ClaudeWebSearchProvider.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { ClaudeWebSearchProvider } from './ClaudeWebSearchProvider';
import { AnthropicProvider } from '@/adapters/models/AnthropicProvider';

describe('ClaudeWebSearchProvider', () => {
  it('implements SearchProvider with stable id', () => {
    const inner = new AnthropicProvider({
      id: 'anthropic-1', apiKey: 'k',
      client: { messages: { stream: () => ({ [Symbol.asyncIterator]: async function* () {} }) } } as never,
    });
    const search = new ClaudeWebSearchProvider(inner);
    expect(search.id).toBe('claude-web-search');
  });

  it('returns empty SourceRef[] for now (P2 routes use inline prose citations)', async () => {
    const inner = new AnthropicProvider({
      id: 'anthropic-1', apiKey: 'k',
      client: { messages: { stream: () => ({ [Symbol.asyncIterator]: async function* () {} }) } } as never,
    });
    const search = new ClaudeWebSearchProvider(inner);
    const out = await search.search('央行扩表');
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/adapters/search/ClaudeWebSearchProvider.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/adapters/search/ClaudeWebSearchProvider.ts`**

```typescript
import type { SearchProvider } from './types';
import type { SourceRef } from '@/types/domain';
import type { AnthropicProvider } from '@/adapters/models/AnthropicProvider';

export class ClaudeWebSearchProvider implements SearchProvider {
  id = 'claude-web-search';

  constructor(private readonly anthropic: AnthropicProvider) {}

  async search(_query: string): Promise<SourceRef[]> {
    // P2: web_search is exercised through AnthropicProvider's tool-use loop
    // inside the /api/ai/verify route. Sources are presented inline in the
    // model's Markdown response (per prompt contract). This standalone
    // search() returns [] until P5 prompt-tuning decides to extract structured
    // citations from streamed tool_use blocks.
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/adapters/search/ClaudeWebSearchProvider.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/search/ClaudeWebSearchProvider.ts src/adapters/search/ClaudeWebSearchProvider.test.ts
git commit -m "feat: ClaudeWebSearchProvider 接口实现（包装 AnthropicProvider）"
```

---

### Task T2.5: TimelineRepo + ModelServiceRepo + CostRepo implementations

P1 declared `TimelineRepo`, `ModelServiceRepo`, `CostRepo` interfaces in `src/adapters/storage/interfaces.ts`. P2 needs all three: TimelineRepo for every AI call's transcript, ModelServiceRepo so AIService can resolve a service by id, CostRepo for per-call token cost recording (UI is P4).

**Files:**
- Create: `src/adapters/storage/IndexedDBTimelineRepo.ts`, `src/adapters/storage/IndexedDBTimelineRepo.test.ts`
- Create: `src/adapters/storage/IndexedDBModelServiceRepo.ts`, `src/adapters/storage/IndexedDBModelServiceRepo.test.ts`
- Create: `src/adapters/storage/IndexedDBCostRepo.ts`, `src/adapters/storage/IndexedDBCostRepo.test.ts`

- [ ] **Step 1: Write failing test `src/adapters/storage/IndexedDBTimelineRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBTimelineRepo } from './IndexedDBTimelineRepo';
import { resetDb } from './db';
import type { TimelineEntry } from '@/types/domain';

const mk = (id: string, bookId: string, ts: Date, original = 'orig', resp = 'resp'): TimelineEntry => ({
  id, bookId, chapterId: 'c1', timestamp: ts,
  type: 'explain', originalText: original, aiModel: 'claude-sonnet-4-6',
  aiResponse: resp, costTokens: { input: 1, output: 1 }, costAmount: 0,
  persona: 'general',
});

describe('IndexedDBTimelineRepo', () => {
  let repo: IndexedDBTimelineRepo;
  beforeEach(async () => { await resetDb(); repo = new IndexedDBTimelineRepo(); });

  it('lists by book in reverse-chronological order', async () => {
    await repo.create(mk('1', 'b1', new Date('2026-01-01')));
    await repo.create(mk('2', 'b1', new Date('2026-01-02')));
    const list = await repo.listByBook('b1');
    expect(list.map(e => e.id)).toEqual(['2', '1']);
  });

  it('searches across originalText, aiResponse, userInput', async () => {
    await repo.create(mk('a', 'b1', new Date(), 'M2 货币供应', 'about money'));
    await repo.create(mk('b', 'b1', new Date(), 'GDP', 'gross domestic product'));
    const hits = await repo.search('b1', 'M2');
    expect(hits.map(e => e.id)).toEqual(['a']);
    const hits2 = await repo.search('b1', 'gross');
    expect(hits2.map(e => e.id)).toEqual(['b']);
  });

  it('listByChapter filters by chapter', async () => {
    const e1 = mk('1', 'b1', new Date()); e1.chapterId = 'cA';
    const e2 = mk('2', 'b1', new Date()); e2.chapterId = 'cB';
    await repo.create(e1); await repo.create(e2);
    expect((await repo.listByChapter('cA')).map(e => e.id)).toEqual(['1']);
  });
});
```

- [ ] **Step 2: Write `src/adapters/storage/IndexedDBTimelineRepo.ts`**

```typescript
import { getDb } from './db';
import type { TimelineRepo } from './interfaces';
import type { TimelineEntry } from '@/types/domain';

export class IndexedDBTimelineRepo implements TimelineRepo {
  async create(entry: TimelineEntry): Promise<void> {
    await getDb().timeline.put(entry);
  }
  async get(id: string): Promise<TimelineEntry | null> {
    return (await getDb().timeline.get(id)) ?? null;
  }
  async listByBook(bookId: string, limit?: number): Promise<TimelineEntry[]> {
    const all = await getDb().timeline.where('bookId').equals(bookId).toArray();
    all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return typeof limit === 'number' ? all.slice(0, limit) : all;
  }
  async listByChapter(chapterId: string): Promise<TimelineEntry[]> {
    const all = await getDb().timeline.where('chapterId').equals(chapterId).toArray();
    return all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  async search(bookId: string, query: string): Promise<TimelineEntry[]> {
    const all = await this.listByBook(bookId);
    const q = query.toLowerCase();
    return all.filter(e =>
      e.originalText.toLowerCase().includes(q) ||
      e.aiResponse.toLowerCase().includes(q) ||
      (e.userInput?.toLowerCase().includes(q) ?? false),
    );
  }
  async delete(id: string): Promise<void> { await getDb().timeline.delete(id); }
}
```

- [ ] **Step 3: Write failing test `src/adapters/storage/IndexedDBModelServiceRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBModelServiceRepo } from './IndexedDBModelServiceRepo';
import { resetDb } from './db';
import type { ModelService } from '@/types/domain';

const mk = (id: string, name = id): ModelService => ({
  id, name, protocol: 'anthropic', baseUrl: 'https://api.anthropic.com',
  apiKeyCipher: 'cipher', enabled: true,
  enabledModels: ['claude-sonnet-4-6'],
  createdAt: new Date(),
});

describe('IndexedDBModelServiceRepo', () => {
  let repo: IndexedDBModelServiceRepo;
  beforeEach(async () => { await resetDb(); repo = new IndexedDBModelServiceRepo(); });

  it('create + get round-trips', async () => {
    await repo.create(mk('s1', 'Anthropic'));
    const got = await repo.get('s1');
    expect(got?.name).toBe('Anthropic');
  });

  it('list returns all', async () => {
    await repo.create(mk('s1')); await repo.create(mk('s2'));
    expect((await repo.list()).length).toBe(2);
  });

  it('update patches a field', async () => {
    await repo.create(mk('s1'));
    await repo.update('s1', { enabled: false });
    expect((await repo.get('s1'))?.enabled).toBe(false);
  });
});
```

- [ ] **Step 4: Write `src/adapters/storage/IndexedDBModelServiceRepo.ts`**

```typescript
import { getDb } from './db';
import type { ModelServiceRepo } from './interfaces';
import type { ModelService } from '@/types/domain';

export class IndexedDBModelServiceRepo implements ModelServiceRepo {
  async create(s: ModelService): Promise<void> { await getDb().modelServices.put(s); }
  async get(id: string): Promise<ModelService | null> {
    return (await getDb().modelServices.get(id)) ?? null;
  }
  async list(): Promise<ModelService[]> { return await getDb().modelServices.toArray(); }
  async update(id: string, patch: Partial<ModelService>): Promise<void> {
    await getDb().modelServices.update(id, patch);
  }
  async delete(id: string): Promise<void> { await getDb().modelServices.delete(id); }
}
```

- [ ] **Step 5: Write failing test `src/adapters/storage/IndexedDBCostRepo.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBCostRepo } from './IndexedDBCostRepo';
import { resetDb } from './db';

describe('IndexedDBCostRepo', () => {
  let repo: IndexedDBCostRepo;
  beforeEach(async () => { await resetDb(); repo = new IndexedDBCostRepo(); });

  it('totalInRange sums amounts', async () => {
    await repo.add({ id: '1', timestamp: new Date('2026-01-01T01:00:00Z'),
      model: 'm', tokens: { input: 100, output: 50 }, amountUSD: 0.4, taskType: 'translate' });
    await repo.add({ id: '2', timestamp: new Date('2026-01-02T01:00:00Z'),
      model: 'm', tokens: { input: 100, output: 50 }, amountUSD: 0.6, taskType: 'chat' });
    const total = await repo.totalInRange(
      new Date('2026-01-01T00:00:00Z'), new Date('2026-01-03T00:00:00Z'),
    );
    expect(total).toBeCloseTo(1.0);
  });

  it('totalForTaskType filters', async () => {
    await repo.add({ id: '1', timestamp: new Date('2026-01-01'),
      model: 'm', tokens: { input: 1, output: 1 }, amountUSD: 0.2, taskType: 'translate' });
    await repo.add({ id: '2', timestamp: new Date('2026-01-01'),
      model: 'm', tokens: { input: 1, output: 1 }, amountUSD: 0.5, taskType: 'verify' });
    const t = await repo.totalForTaskType(
      new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'), 'verify',
    );
    expect(t).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 6: Write `src/adapters/storage/IndexedDBCostRepo.ts`**

```typescript
import { getDb } from './db';
import type { CostRepo } from './interfaces';
import type { CostRecord, TaskType } from '@/types/domain';

export class IndexedDBCostRepo implements CostRepo {
  async add(record: CostRecord): Promise<void> { await getDb().costRecords.put(record); }
  async listInRange(from: Date, to: Date): Promise<CostRecord[]> {
    return await getDb().costRecords
      .where('timestamp').between(from, to, true, true).toArray();
  }
  async totalInRange(from: Date, to: Date): Promise<number> {
    const list = await this.listInRange(from, to);
    return list.reduce((s, r) => s + r.amountUSD, 0);
  }
  async totalForTaskType(from: Date, to: Date, type: TaskType): Promise<number> {
    const list = await this.listInRange(from, to);
    return list.filter(r => r.taskType === type).reduce((s, r) => s + r.amountUSD, 0);
  }
}
```

- [ ] **Step 7: Run all three test files**

```bash
npm test -- src/adapters/storage
```
Expected: all passing (including P1's BookRepo/ChapterRepo/ConfigRepo tests).

- [ ] **Step 8: Commit**

```bash
git add src/adapters/storage
git commit -m "feat: TimelineRepo / ModelServiceRepo / CostRepo IndexedDB 实现"
```

---

### Task T2.6: TaskRouter — TaskType → ModelRef resolution

`TaskRouter` reads the user's `TaskRouting` (saved in `ConfigRepo` under key `task-routing`) and returns the `ModelRef` for a given `TaskType`. If no routing is configured, it falls back to a built-in default that points at Anthropic Claude. Used by `AIService` (T2.7) to pick a service+model pair before calling the API route.

**Files:**
- Create: `src/services/TaskRouter.ts`, `src/services/TaskRouter.test.ts`

- [ ] **Step 1: Write failing test `src/services/TaskRouter.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRouter, DEFAULT_TASK_ROUTING } from './TaskRouter';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { resetDb } from '@/adapters/storage/db';

describe('TaskRouter', () => {
  let cfg: IndexedDBConfigRepo;
  beforeEach(async () => { await resetDb(); cfg = new IndexedDBConfigRepo(); });

  it('returns built-in default when no routing saved', async () => {
    const router = new TaskRouter(cfg);
    const ref = await router.resolveModel('translate');
    expect(ref).toEqual(DEFAULT_TASK_ROUTING.translate);
  });

  it('returns user-saved routing when present', async () => {
    await cfg.set('task-routing', {
      ...DEFAULT_TASK_ROUTING,
      explain: { serviceId: 'my-svc', modelId: 'my-model' },
    });
    const router = new TaskRouter(cfg);
    const ref = await router.resolveModel('explain');
    expect(ref).toEqual({ serviceId: 'my-svc', modelId: 'my-model' });
  });

  it('override wins over both default and saved', async () => {
    const router = new TaskRouter(cfg);
    const ref = await router.resolveModel('chat', { serviceId: 's', modelId: 'm' });
    expect(ref).toEqual({ serviceId: 's', modelId: 'm' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/services/TaskRouter.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/services/TaskRouter.ts`**

```typescript
import type { ConfigRepo } from '@/adapters/storage/interfaces';
import type { TaskType, TaskRouting, ModelRef } from '@/types/domain';

const DEFAULT_SVC = 'anthropic-default';

export const DEFAULT_TASK_ROUTING: TaskRouting = {
  translate: { serviceId: DEFAULT_SVC, modelId: 'claude-haiku-4-5' },
  explain:   { serviceId: DEFAULT_SVC, modelId: 'claude-sonnet-4-6' },
  verify:    { serviceId: DEFAULT_SVC, modelId: 'claude-sonnet-4-6' },
  summarize: { serviceId: DEFAULT_SVC, modelId: 'claude-sonnet-4-6' },
  chat:      { serviceId: DEFAULT_SVC, modelId: 'claude-sonnet-4-6' },
};

export class TaskRouter {
  constructor(private cfg: ConfigRepo) {}

  async resolveModel(task: TaskType, override?: ModelRef): Promise<ModelRef> {
    if (override) return override;
    const saved = await this.cfg.get<TaskRouting>('task-routing');
    return (saved?.[task]) ?? DEFAULT_TASK_ROUTING[task];
  }

  async getRouting(): Promise<TaskRouting> {
    const saved = await this.cfg.get<TaskRouting>('task-routing');
    return saved ?? DEFAULT_TASK_ROUTING;
  }

  async setRouting(routing: TaskRouting): Promise<void> {
    await this.cfg.set('task-routing', routing);
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/services/TaskRouter.test.ts
```
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/TaskRouter.ts src/services/TaskRouter.test.ts
git commit -m "feat: TaskRouter 任务到模型的路由解析"
```

---

### Task T2.7: AIService — core dispatch + timeline write

The AIService is the **client-side** orchestrator: it resolves the `ModelRef` via TaskRouter, calls the matching `/api/ai/*` route, streams chunks back to the caller, and on completion writes a `TimelineEntry` via TimelineRepo and a `CostRecord` via CostRepo. The actual provider call happens server-side inside the API route.

Note: For P2, AIService passes `{ serviceId, modelId, bookId, chapterId, ... }` in the JSON body. The API route loads the corresponding `ModelService` server-side and reads its `ANTHROPIC_API_KEY` from `process.env` (open question: if user has multiple services in P4, this needs to change, but P2 only supports the one seeded Anthropic service). This deferred decision is documented in the route helper code comment.

**Files:**
- Create: `src/services/AIService.ts`, `src/services/AIService.test.ts`
- Create: `src/lib/ndjson.ts`, `src/lib/ndjson.test.ts`

- [ ] **Step 1: Write `src/lib/ndjson.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { readNDJSON } from './ndjson';
import type { ChatChunk } from '@/types/api';

describe('readNDJSON', () => {
  it('parses one JSON object per line', async () => {
    const body = [
      '{"type":"text","text":"a"}',
      '{"type":"text","text":"b"}',
      '{"type":"usage","inputTokens":5,"outputTokens":2}',
      '',
    ].join('\n');
    const res = new Response(body);
    const out: ChatChunk[] = [];
    for await (const c of readNDJSON(res)) out.push(c);
    expect(out.map(c => c.type)).toEqual(['text', 'text', 'usage']);
    expect(out[0].text).toBe('a');
  });
});
```

- [ ] **Step 2: Write `src/lib/ndjson.ts`**

```typescript
import type { ChatChunk } from '@/types/api';

export async function* readNDJSON(res: Response): AsyncIterable<ChatChunk> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try { yield JSON.parse(s) as ChatChunk; } catch { /* skip */ }
    }
  }
  if (buf.trim()) {
    try { yield JSON.parse(buf.trim()) as ChatChunk; } catch { /* skip */ }
  }
}
```

- [ ] **Step 3: Write failing test `src/services/AIService.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIService } from './AIService';
import { TaskRouter, DEFAULT_TASK_ROUTING } from './TaskRouter';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { IndexedDBCostRepo } from '@/adapters/storage/IndexedDBCostRepo';
import { resetDb } from '@/adapters/storage/db';

const ndjsonBody = (lines: object[]): string => lines.map(l => JSON.stringify(l)).join('\n');

describe('AIService.translate', () => {
  beforeEach(async () => { await resetDb(); });

  it('streams chunks and writes TimelineEntry + CostRecord on completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(ndjsonBody([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'usage', inputTokens: 100, outputTokens: 20 },
    ]), { headers: { 'Content-Type': 'application/x-ndjson' } }));

    const router = new TaskRouter(new IndexedDBConfigRepo());
    const timeline = new IndexedDBTimelineRepo();
    const cost = new IndexedDBCostRepo();
    const ai = new AIService({ router, timeline, cost, fetchImpl: fetchMock });

    const out: string[] = [];
    for await (const c of ai.translate({
      bookId: 'b1', chapterId: 'c1', text: 'hello',
    })) {
      if (c.type === 'text' && c.text) out.push(c.text);
    }
    expect(out.join('')).toBe('Hello');

    const entries = await timeline.listByBook('b1');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('translate');
    expect(entries[0].originalText).toBe('hello');
    expect(entries[0].aiResponse).toBe('Hello');
    expect(entries[0].costTokens).toEqual({ input: 100, output: 20 });

    const totalUsd = await cost.totalInRange(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(totalUsd).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/translate',
      expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      modelId: DEFAULT_TASK_ROUTING.translate.modelId,
      serviceId: DEFAULT_TASK_ROUTING.translate.serviceId,
      text: 'hello',
    });
  });
});
```

- [ ] **Step 4: Write `src/services/AIService.ts`**

```typescript
import type { ChatChunk } from '@/types/api';
import type { TaskType, TimelineEntry, ModelRef, CostRecord } from '@/types/domain';
import type { TimelineRepo, CostRepo } from '@/adapters/storage/interfaces';
import type { TaskRouter } from './TaskRouter';
import { readNDJSON } from '@/lib/ndjson';
import { estimateCostUSD } from '@/lib/pricing';

export interface ChatAnchor {
  originalText: string;
  type: TaskType;
}

interface AIServiceArgs {
  router: TaskRouter;
  timeline: TimelineRepo;
  cost: CostRepo;
  fetchImpl?: typeof fetch;
}

interface BaseCallOpts {
  bookId: string;
  chapterId: string;
  override?: ModelRef;
  page?: number;
  threadId?: string;
  userInput?: string;
}

export class AIService {
  private fetchImpl: typeof fetch;
  constructor(private readonly args: AIServiceArgs) {
    this.fetchImpl = args.fetchImpl ?? fetch;
  }

  private async resolve(task: TaskType, override?: ModelRef) {
    return await this.args.router.resolveModel(task, override);
  }

  private async *runStream(
    endpoint: string,
    body: Record<string, unknown>,
    task: TaskType,
    opts: BaseCallOpts,
    originalText: string,
    modelRef: ModelRef,
  ): AsyncIterable<ChatChunk> {
    const res = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, serviceId: modelRef.serviceId, modelId: modelRef.modelId }),
    });
    if (!res.ok) {
      yield { type: 'error', error: `${endpoint} HTTP ${res.status}` };
      return;
    }

    let aggregated = '';
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const chunk of readNDJSON(res)) {
      if (chunk.type === 'text' && chunk.text) aggregated += chunk.text;
      if (chunk.type === 'usage') {
        inputTokens = chunk.inputTokens ?? 0;
        outputTokens = chunk.outputTokens ?? 0;
      }
      yield chunk;
    }

    const cost = estimateCostUSD(modelRef.modelId, inputTokens, outputTokens);
    const id = `tl-${crypto.randomUUID()}`;
    const entry: TimelineEntry = {
      id,
      bookId: opts.bookId,
      chapterId: opts.chapterId,
      timestamp: new Date(),
      type: task,
      originalText,
      page: opts.page,
      userInput: opts.userInput,
      aiModel: modelRef.modelId,
      aiResponse: aggregated,
      costTokens: { input: inputTokens, output: outputTokens },
      costAmount: cost,
      persona: 'general',
      threadId: opts.threadId,
    };
    await this.args.timeline.create(entry);

    const costRecord: CostRecord = {
      id: `cost-${crypto.randomUUID()}`,
      timestamp: new Date(),
      model: modelRef.modelId,
      tokens: { input: inputTokens, output: outputTokens },
      amountUSD: cost,
      taskType: task,
    };
    await this.args.cost.add(costRecord);
  }

  async *translate(opts: BaseCallOpts & { text: string }): AsyncIterable<ChatChunk> {
    const ref = await this.resolve('translate', opts.override);
    yield* this.runStream('/api/ai/translate',
      { text: opts.text }, 'translate', opts, opts.text, ref);
  }

  async *explain(opts: BaseCallOpts & { text: string; context: string }): AsyncIterable<ChatChunk> {
    const ref = await this.resolve('explain', opts.override);
    yield* this.runStream('/api/ai/explain',
      { text: opts.text, context: opts.context }, 'explain', opts, opts.text, ref);
  }

  async *verify(opts: BaseCallOpts & { text: string; context: string }): AsyncIterable<ChatChunk> {
    const ref = await this.resolve('verify', opts.override);
    yield* this.runStream('/api/ai/verify',
      { text: opts.text, context: opts.context }, 'verify', opts, opts.text, ref);
  }

  async *summarize(opts: BaseCallOpts & { chapterContent: string }): AsyncIterable<ChatChunk> {
    const ref = await this.resolve('summarize', opts.override);
    yield* this.runStream('/api/ai/summarize',
      { chapterContent: opts.chapterContent }, 'summarize', opts, '【整章总结】', ref);
  }

  async *chat(opts: BaseCallOpts & {
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    context: string;
    anchor?: ChatAnchor;
  }): AsyncIterable<ChatChunk> {
    const ref = await this.resolve('chat', opts.override);
    const lastUser = [...opts.history].reverse().find(m => m.role === 'user')?.content ?? '';
    yield* this.runStream('/api/ai/chat',
      { history: opts.history, context: opts.context, anchor: opts.anchor },
      'chat', { ...opts, userInput: lastUser }, opts.anchor?.originalText ?? lastUser, ref);
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/lib/ndjson.test.ts src/services/AIService.test.ts
```
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ndjson.ts src/lib/ndjson.test.ts src/services/AIService.ts src/services/AIService.test.ts
git commit -m "feat: AIService 客户端任务调度 + timeline/cost 写入"
```

---

### Task T2.8: Pricing table

Built-in pricing for the models P2 actually calls. P4 will add custom pricing UI. Used by AIService to compute `costAmount` per call.

**Files:**
- Create: `src/lib/pricing.ts`, `src/lib/pricing.test.ts`

- [ ] **Step 1: Write failing test `src/lib/pricing.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { estimateCostUSD, getPricing, BUILTIN_PRICING } from './pricing';

describe('pricing', () => {
  it('has Sonnet 4.6 and Haiku 4.5 entries', () => {
    expect(BUILTIN_PRICING['claude-sonnet-4-6']).toBeDefined();
    expect(BUILTIN_PRICING['claude-haiku-4-5']).toBeDefined();
  });

  it('estimateCostUSD == (input/1M)*priceIn + (output/1M)*priceOut', () => {
    const p = BUILTIN_PRICING['claude-sonnet-4-6'];
    const usd = estimateCostUSD('claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(usd).toBeCloseTo(p.input + p.output, 6);
  });

  it('returns 0 for unknown model', () => {
    expect(estimateCostUSD('gpt-99', 1000, 500)).toBe(0);
  });

  it('getPricing returns undefined for unknown', () => {
    expect(getPricing('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/lib/pricing.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/pricing.ts`**

```typescript
export interface PricePerMillion {
  input: number;   // USD per 1M input tokens
  output: number;  // USD per 1M output tokens
}

export const BUILTIN_PRICING: Record<string, PricePerMillion> = {
  // Anthropic
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5':  { input: 0.8, output: 4 },
  // OpenAI
  'gpt-4o':       { input: 2.5, output: 10 },
  'gpt-4o-mini':  { input: 0.15, output: 0.6 },
  // Examples for relay services
  'deepseek-chat':     { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

export function getPricing(modelId: string): PricePerMillion | undefined {
  return BUILTIN_PRICING[modelId];
}

export function estimateCostUSD(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = getPricing(modelId);
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/lib/pricing.test.ts
```
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing.ts src/lib/pricing.test.ts
git commit -m "feat: 内置模型计价表 + 成本估算"
```

---

### Task T2.9: CostMeter — aggregate cost queries

CostMeter wraps `CostRepo` to provide the "today" / "this month" totals that P4's CostBadge UI will display. P2 wires the writer side (AIService writes records) and provides the reader side (`getToday()`, `getMonth()`) so P4 only needs to render.

**Files:**
- Create: `src/services/CostMeter.ts`, `src/services/CostMeter.test.ts`

- [ ] **Step 1: Write failing test `src/services/CostMeter.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CostMeter } from './CostMeter';
import { IndexedDBCostRepo } from '@/adapters/storage/IndexedDBCostRepo';
import { resetDb } from '@/adapters/storage/db';

describe('CostMeter', () => {
  let repo: IndexedDBCostRepo;
  let meter: CostMeter;
  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBCostRepo();
    meter = new CostMeter(repo);
  });

  it('getToday sums today only', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    await repo.add({ id: '1', timestamp: yesterday,
      model: 'm', tokens: { input: 1, output: 1 }, amountUSD: 0.5, taskType: 'translate' });
    await repo.add({ id: '2', timestamp: now,
      model: 'm', tokens: { input: 1, output: 1 }, amountUSD: 0.3, taskType: 'chat' });
    expect(await meter.getToday()).toBeCloseTo(0.3);
  });

  it('getMonth sums current month', async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    await repo.add({ id: '1', timestamp: start,
      model: 'm', tokens: { input: 1, output: 1 }, amountUSD: 0.4, taskType: 'translate' });
    await repo.add({ id: '2', timestamp: now,
      model: 'm', tokens: { input: 1, output: 1 }, amountUSD: 0.6, taskType: 'chat' });
    expect(await meter.getMonth()).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- src/services/CostMeter.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/services/CostMeter.ts`**

```typescript
import type { CostRepo } from '@/adapters/storage/interfaces';

export class CostMeter {
  constructor(private repo: CostRepo) {}

  private startOfDay(d = new Date()): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  private startOfMonth(d = new Date()): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  async getToday(): Promise<number> {
    const from = this.startOfDay();
    const to = new Date(from.getTime() + 86_400_000);
    return await this.repo.totalInRange(from, to);
  }

  async getMonth(): Promise<number> {
    const from = this.startOfMonth();
    const next = new Date(from);
    next.setMonth(next.getMonth() + 1);
    return await this.repo.totalInRange(from, next);
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/services/CostMeter.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/CostMeter.ts src/services/CostMeter.test.ts
git commit -m "feat: CostMeter 今日/本月成本聚合"
```

---

### Task T2.10: Prompt template — translate

**Files:**
- Create: `src/lib/prompts/translate.ts`, `src/lib/prompts/translate.test.ts`

- [ ] **Step 1: Write failing test `src/lib/prompts/translate.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildTranslatePrompt } from './translate';

describe('buildTranslatePrompt', () => {
  it('emits system + user with original text in user message', () => {
    const out = buildTranslatePrompt('M2 supply rose 12%');
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('system');
    expect(out[1].role).toBe('user');
    expect(out[1].content).toContain('M2 supply rose 12%');
  });

  it('system prompt forbids commentary', () => {
    const out = buildTranslatePrompt('x');
    expect(out[0].content).toMatch(/不要解释|只输出译文/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- src/lib/prompts/translate.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/prompts/translate.ts`**

```typescript
import type { ChatMessage } from '@/adapters/models/types';

export function buildTranslatePrompt(text: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是一位严谨的双语译者，专门服务于深度阅读场景（短期主攻金融科普书籍）。
- 自动检测原文语言。中文 → 英文，英文 → 中文，其他 → 中文。
- 翻译简洁、准确、自然。
- 若原文含专业术语（特别是金融/经济术语），译文后用括号标注原文术语并简短说明其语义保留情况。
  例: "对冲（hedge，保留 hedge 的 '屏障' 语义）"
- 不要解释，只输出译文，不要客套话。`,
    },
    { role: 'user', content: text },
  ];
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/lib/prompts/translate.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/translate.ts src/lib/prompts/translate.test.ts
git commit -m "feat: 翻译 prompt 模板"
```

---

### Task T2.11: Prompt template — explain

**Files:**
- Create: `src/lib/prompts/explain.ts`, `src/lib/prompts/explain.test.ts`

- [ ] **Step 1: Write failing test `src/lib/prompts/explain.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildExplainPrompt } from './explain';

describe('buildExplainPrompt', () => {
  it('includes selection text and chapter context in user message', () => {
    const out = buildExplainPrompt('M2', '本章在讲货币供给传导');
    expect(out[1].content).toContain('M2');
    expect(out[1].content).toContain('本章在讲货币供给传导');
  });

  it('truncates long context to keep prompt budget reasonable', () => {
    const longCtx = 'x'.repeat(20_000);
    const out = buildExplainPrompt('term', longCtx);
    expect(out[1].content.length).toBeLessThan(longCtx.length + 1000);
  });

  it('system prompt demands the 4-part structure', () => {
    const out = buildExplainPrompt('x', '');
    expect(out[0].content).toMatch(/概念定义/);
    expect(out[0].content).toMatch(/类比/);
    expect(out[0].content).toMatch(/相关概念/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- src/lib/prompts/explain.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/prompts/explain.ts`**

```typescript
import type { ChatMessage } from '@/adapters/models/types';

const MAX_CONTEXT_CHARS = 4000;

export function buildExplainPrompt(text: string, context: string): ChatMessage[] {
  const ctx = context.length > MAX_CONTEXT_CHARS
    ? context.slice(0, MAX_CONTEXT_CHARS) + '...[已截断]'
    : context;
  return [
    {
      role: 'system',
      content: `你是一位阅读助手，专门帮读者读懂中英文书籍里的概念和术语（短期主攻金融科普）。
读者划选了一段文字，希望理解它。请按下列结构用 Markdown 输出：

**概念定义**（≤2 句，给出严谨定义）
**本章语境**（这个概念在本章上下文里指的是什么）
**通俗类比**（一句话，让外行也能懂）
**相关概念**（1-3 个紧密相关、读者可能也不懂的术语，用列表）

要简洁，不要客套话，不要重复读者已选的原文。`,
    },
    {
      role: 'user',
      content: `本章上下文（节选）：
${ctx}

读者划选的内容：
${text}`,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/lib/prompts/explain.test.ts
```
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/explain.ts src/lib/prompts/explain.test.ts
git commit -m "feat: 解释 prompt 模板"
```

---

### Task T2.12: Prompt template — verify (with structured Markdown contract)

The verify response is rendered directly in the AI sidebar as Markdown. The prompt enforces a stable section layout (`**观点摘要**`, `**支持证据**`, `**反对证据**`, `**综合判断**`, `**置信度**`) so the sidebar can later (P3/P5) optionally extract structured fields with regex. P2 just renders as Markdown.

Note: The four verdicts (`widely_accepted` / `contested` / `refuted` / `insufficient`) are surfaced as Chinese labels in the output but the underlying English keys are documented for future structured parsing.

**Files:**
- Create: `src/lib/prompts/verify.ts`, `src/lib/prompts/verify.test.ts`

- [ ] **Step 1: Write failing test `src/lib/prompts/verify.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildVerifyPrompt } from './verify';

describe('buildVerifyPrompt', () => {
  it('requires URL-cited evidence', () => {
    const out = buildVerifyPrompt('央行扩表必然推高房价', '本章语境');
    expect(out[0].content).toMatch(/URL/);
    expect(out[0].content).toMatch(/严禁编造/);
  });

  it('enforces 5-year recency window for citations', () => {
    const out = buildVerifyPrompt('x', '');
    expect(out[0].content).toMatch(/5\s*年|近五年/);
  });

  it('enforces the 4 verdict labels', () => {
    const out = buildVerifyPrompt('x', '');
    expect(out[0].content).toContain('widely_accepted');
    expect(out[0].content).toContain('contested');
    expect(out[0].content).toContain('refuted');
    expect(out[0].content).toContain('insufficient');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- src/lib/prompts/verify.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/prompts/verify.ts`**

```typescript
import type { ChatMessage } from '@/adapters/models/types';

const MAX_CONTEXT_CHARS = 3000;

export function buildVerifyPrompt(text: string, context: string): ChatMessage[] {
  const ctx = context.length > MAX_CONTEXT_CHARS
    ? context.slice(0, MAX_CONTEXT_CHARS) + '...[已截断]'
    : context;
  return [
    {
      role: 'system',
      content: `你是一位严谨的事实核查 / 观点验证助手。
读者从一本书中划选了一段观点或论断，希望验证它在当下的可信度。

工作流：
1) 用 ≤1 句重述读者的核心观点。
2) 使用 web_search 工具检索近 5 年（金融领域强约束）的可靠来源，给出：
   - 支持证据 2-3 条（必须含真实可访问 URL）
   - 反对 / 补充证据 2-3 条（必须含真实可访问 URL）
3) 给出综合判断，从下列四档选一：
   - widely_accepted（广泛认可）
   - contested（存在争议）
   - refuted（已被驳斥）
   - insufficient（证据不足）
4) 给出置信度：high / medium / low

【硬约束】
- 严禁编造来源、严禁伪造 URL。
- 来源时间戳超过 5 年的不计入（金融领域强约束）。
- 若搜索失败或没有可靠来源，必须返回 insufficient + low。
- 不要客套话。

输出格式（严格遵守）：
**观点摘要**: ...
**支持证据**:
- [标题](url) — 一句摘要（发布日期）
- [标题](url) — 一句摘要（发布日期）
**反对 / 补充证据**:
- [标题](url) — 一句摘要（发布日期）
**综合判断**: widely_accepted | contested | refuted | insufficient
**置信度**: high | medium | low
**理由**: 一段话简短解释你的判断依据。`,
    },
    {
      role: 'user',
      content: `本章上下文（节选）：
${ctx}

读者划选的观点：
${text}`,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/lib/prompts/verify.test.ts
```
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/verify.ts src/lib/prompts/verify.test.ts
git commit -m "feat: 联网验证 prompt 模板（含结构化输出契约）"
```

---

### Task T2.13: Prompt template — summarize

**Files:**
- Create: `src/lib/prompts/summarize.ts`, `src/lib/prompts/summarize.test.ts`

- [ ] **Step 1: Write failing test `src/lib/prompts/summarize.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildSummarizePrompt } from './summarize';

describe('buildSummarizePrompt', () => {
  it('puts chapter content into the user message', () => {
    const out = buildSummarizePrompt('本章正文示例');
    expect(out[1].content).toContain('本章正文示例');
  });

  it('truncates very large chapter content', () => {
    const huge = 'a'.repeat(120_000);
    const out = buildSummarizePrompt(huge);
    expect(out[1].content.length).toBeLessThan(huge.length);
  });

  it('system prompt asks for the 4 mandatory sections', () => {
    const out = buildSummarizePrompt('x');
    expect(out[0].content).toMatch(/核心论点/);
    expect(out[0].content).toMatch(/关键概念/);
    expect(out[0].content).toMatch(/论证流程|论证逻辑/);
    expect(out[0].content).toMatch(/待思考问题/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- src/lib/prompts/summarize.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/prompts/summarize.ts`**

```typescript
import type { ChatMessage } from '@/adapters/models/types';

const MAX_CHAPTER_CHARS = 60_000;

export function buildSummarizePrompt(chapterContent: string): ChatMessage[] {
  const body = chapterContent.length > MAX_CHAPTER_CHARS
    ? chapterContent.slice(0, MAX_CHAPTER_CHARS) + '...[已截断]'
    : chapterContent;
  return [
    {
      role: 'system',
      content: `你是金融 / 学术阅读助手。读者刚读完一章，希望快速回顾。请用 Markdown 严格按下列结构输出：

**核心论点**（≤3 条，每条 ≤25 字）
- ...
- ...

**关键概念**（列出本章重要术语与一句话定义）
- 术语 — 一句话定义

**作者论证流程**（一段 ≤5 句话，说明作者从哪里出发，经过什么推理，得到什么结论）

**待思考问题**（3-5 个，能引发读者反思的开放问题）
- ...

不要客套话，不要重复章节标题，不要照搬原文长段。`,
    },
    {
      role: 'user',
      content: `章节正文：
${body}`,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/lib/prompts/summarize.test.ts
```
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/summarize.ts src/lib/prompts/summarize.test.ts
git commit -m "feat: 章节总结 prompt 模板"
```

---

### Task T2.14: Prompt template — chat (with anchor and history)

**Files:**
- Create: `src/lib/prompts/chat.ts`, `src/lib/prompts/chat.test.ts`

- [ ] **Step 1: Write failing test `src/lib/prompts/chat.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildChatPrompt } from './chat';

describe('buildChatPrompt', () => {
  it('puts chapter context and anchor in system, then appends history', () => {
    const out = buildChatPrompt(
      [{ role: 'user', content: '为什么会这样?' }],
      '本章在讨论货币供应',
      { originalText: 'M2', type: 'explain' },
    );
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('本章在讨论货币供应');
    expect(out[0].content).toContain('M2');
    expect(out.at(-1)?.content).toBe('为什么会这样?');
  });

  it('works without anchor', () => {
    const out = buildChatPrompt(
      [{ role: 'user', content: 'hi' }],
      'ctx',
    );
    expect(out[0].content).toContain('ctx');
    expect(out.at(-1)?.content).toBe('hi');
  });

  it('keeps multi-turn history order', () => {
    const out = buildChatPrompt(
      [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
      ],
      'ctx',
    );
    expect(out.slice(1).map(m => m.content)).toEqual(['q1', 'a1', 'q2']);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- src/lib/prompts/chat.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/prompts/chat.ts`**

```typescript
import type { ChatMessage } from '@/adapters/models/types';
import type { TaskType } from '@/types/domain';

export interface ChatAnchor {
  originalText: string;
  type: TaskType;
}

const MAX_CONTEXT_CHARS = 8000;

export function buildChatPrompt(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: string,
  anchor?: ChatAnchor,
): ChatMessage[] {
  const ctx = context.length > MAX_CONTEXT_CHARS
    ? context.slice(0, MAX_CONTEXT_CHARS) + '...[已截断]'
    : context;
  const anchorBlock = anchor
    ? `\n\n[读者锚点] 类型: ${anchor.type}\n原文: ${anchor.originalText}`
    : '';
  const sys = `你是一位陪读伙伴，正在帮读者读懂一本书（短期主攻金融科普）。
- 用读者的语言（中文优先）回答。
- 引用本章上下文做支撑，避免脱离原文凭空发挥。
- 简洁有据，必要时使用 Markdown 列表。
- 如果读者的问题超出本章范围，先承认范围，再给出推断；不要编造书中没有的细节。

[本章上下文 / 节选]
${ctx}${anchorBlock}`;
  return [
    { role: 'system', content: sys },
    ...history.map(h => ({ role: h.role, content: h.content })),
  ];
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- src/lib/prompts/chat.test.ts
```
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/chat.ts src/lib/prompts/chat.test.ts
git commit -m "feat: 追问对话 prompt 模板（含锚点）"
```

---

### Task T2.15: API Route /api/ai/translate (NDJSON streaming)

The route loads the user's seeded `ModelService` from IndexedDB on the **client** is impossible; the server doesn't share IndexedDB. So for P2, the server reads `ANTHROPIC_API_KEY` from `process.env.ANTHROPIC_API_KEY` and constructs the provider directly. The `serviceId` / `modelId` posted from the client are used only to pick which model to call inside the chosen provider.

Note (architectural decision deferred): When multiple `ModelService`s exist in P4, the server needs a different way to obtain the API key (header forwarding from a master-password-unlocked client, or per-call key envelope decryption). P2 keeps it simple by hardcoding the env var.

**Files:**
- Create: `src/app/api/ai/_lib/serverProvider.ts`
- Create: `src/app/api/ai/_lib/streamResponse.ts`
- Create: `src/app/api/ai/translate/route.ts`
- Create: `.env.example` if missing (sample template), update `.env.local` instructions

- [ ] **Step 1: Write `.env.example`**

```
# Aether Reader Flow — sample env. Copy to .env.local and fill in.
# P2 only: a single Anthropic key is read server-side.
# P4 replaces this with per-service IndexedDB config + master password.
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

- [ ] **Step 2: Write `src/app/api/ai/_lib/serverProvider.ts`**

```typescript
import { AnthropicProvider } from '@/adapters/models/AnthropicProvider';
import { OpenAICompatibleProvider } from '@/adapters/models/OpenAICompatibleProvider';
import type { ModelProvider } from '@/adapters/models/types';

export interface ServerProviderConfig {
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  apiKey: string;
}

export function buildServerProvider(cfg: ServerProviderConfig, serviceId: string): ModelProvider {
  if (cfg.protocol === 'anthropic') {
    return new AnthropicProvider({ id: serviceId, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
  }
  return new OpenAICompatibleProvider({ id: serviceId, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
}

/**
 * P2 single-service shim:
 * - Reads ANTHROPIC_API_KEY from env.
 * - Returns Anthropic at https://api.anthropic.com.
 * - P4 will replace this with a per-request lookup once Settings UI exists.
 */
export function resolveServerProvider(serviceId: string): ServerProviderConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured. Set it in .env.local.');
  return { protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey };
}
```

- [ ] **Step 3: Write `src/app/api/ai/_lib/streamResponse.ts`**

```typescript
import type { ChatChunk } from '@/types/api';

export function ndjsonResponse(iter: AsyncIterable<ChatChunk>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iter) {
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream error';
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: msg }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
```

- [ ] **Step 4: Write `src/app/api/ai/translate/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { buildTranslatePrompt } from '@/lib/prompts/translate';
import { buildServerProvider, resolveServerProvider } from '../_lib/serverProvider';
import { ndjsonResponse } from '../_lib/streamResponse';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { serviceId: string; modelId: string; text: string };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 }); }
  const { serviceId, modelId, text } = body;
  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'text required' }), { status: 400 });
  }
  let provider;
  try {
    const cfg = resolveServerProvider(serviceId);
    provider = buildServerProvider(cfg, serviceId);
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : 'provider config error',
    }), { status: 500 });
  }
  const iter = provider.chat({
    modelId,
    messages: buildTranslatePrompt(text),
    maxTokens: 1024,
  });
  return ndjsonResponse(iter);
}
```

- [ ] **Step 5: Build check**

```bash
npm run build
```
Expected: build succeeds (route registered).

- [ ] **Step 6: Commit**

```bash
git add .env.example src/app/api/ai/_lib src/app/api/ai/translate
git commit -m "feat: /api/ai/translate 路由（NDJSON 流式）"
```

---

### Task T2.16: API Route /api/ai/explain (streaming)

**Files:**
- Create: `src/app/api/ai/explain/route.ts`

- [ ] **Step 1: Write `src/app/api/ai/explain/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { buildExplainPrompt } from '@/lib/prompts/explain';
import { buildServerProvider, resolveServerProvider } from '../_lib/serverProvider';
import { ndjsonResponse } from '../_lib/streamResponse';

export const runtime = 'nodejs';

interface Body {
  serviceId: string;
  modelId: string;
  text: string;
  context: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json() as Body; }
  catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 }); }
  const { serviceId, modelId, text, context } = body;
  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'text required' }), { status: 400 });
  }
  let provider;
  try {
    const cfg = resolveServerProvider(serviceId);
    provider = buildServerProvider(cfg, serviceId);
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : 'provider config error',
    }), { status: 500 });
  }
  const iter = provider.chat({
    modelId,
    messages: buildExplainPrompt(text, context ?? ''),
    maxTokens: 1500,
  });
  return ndjsonResponse(iter);
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/explain
git commit -m "feat: /api/ai/explain 路由（流式）"
```

---

### Task T2.17: API Route /api/ai/verify (streaming with web search)

This route forces `webSearch: true` on the AnthropicProvider. It also rejects non-anthropic protocols (OpenAI-compatible providers don't have a built-in web search). The AI's final response is plain Markdown matching the contract from T2.12; the route does not parse it into a structured JSON — the client renders the Markdown directly. Future P3/P5 work may add a parser if needed.

**Files:**
- Create: `src/app/api/ai/verify/route.ts`

- [ ] **Step 1: Write `src/app/api/ai/verify/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { buildVerifyPrompt } from '@/lib/prompts/verify';
import { buildServerProvider, resolveServerProvider } from '../_lib/serverProvider';
import { ndjsonResponse } from '../_lib/streamResponse';

export const runtime = 'nodejs';

interface Body {
  serviceId: string;
  modelId: string;
  text: string;
  context: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json() as Body; }
  catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 }); }
  const { serviceId, modelId, text, context } = body;
  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'text required' }), { status: 400 });
  }
  let provider;
  try {
    const cfg = resolveServerProvider(serviceId);
    if (cfg.protocol !== 'anthropic') {
      return new Response(JSON.stringify({
        error: 'verify (web search) currently requires the Anthropic protocol.',
      }), { status: 400 });
    }
    provider = buildServerProvider(cfg, serviceId);
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : 'provider config error',
    }), { status: 500 });
  }
  const iter = provider.chat({
    modelId,
    messages: buildVerifyPrompt(text, context ?? ''),
    maxTokens: 4000,
    webSearch: true,
  });
  return ndjsonResponse(iter);
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/verify
git commit -m "feat: /api/ai/verify 路由（流式 + 联网检索）"
```

---

### Task T2.18: API Routes /api/ai/summarize and /api/ai/chat (streaming)

**Files:**
- Create: `src/app/api/ai/summarize/route.ts`, `src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Write `src/app/api/ai/summarize/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { buildSummarizePrompt } from '@/lib/prompts/summarize';
import { buildServerProvider, resolveServerProvider } from '../_lib/serverProvider';
import { ndjsonResponse } from '../_lib/streamResponse';

export const runtime = 'nodejs';

interface Body {
  serviceId: string;
  modelId: string;
  chapterContent: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json() as Body; }
  catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 }); }
  const { serviceId, modelId, chapterContent } = body;
  if (!chapterContent?.trim()) {
    return new Response(JSON.stringify({ error: 'chapterContent required' }), { status: 400 });
  }
  let provider;
  try {
    const cfg = resolveServerProvider(serviceId);
    provider = buildServerProvider(cfg, serviceId);
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : 'provider config error',
    }), { status: 500 });
  }
  const iter = provider.chat({
    modelId,
    messages: buildSummarizePrompt(chapterContent),
    maxTokens: 3000,
  });
  return ndjsonResponse(iter);
}
```

- [ ] **Step 2: Write `src/app/api/ai/chat/route.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { buildChatPrompt, type ChatAnchor } from '@/lib/prompts/chat';
import { buildServerProvider, resolveServerProvider } from '../_lib/serverProvider';
import { ndjsonResponse } from '../_lib/streamResponse';

export const runtime = 'nodejs';

interface Body {
  serviceId: string;
  modelId: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: string;
  anchor?: ChatAnchor;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json() as Body; }
  catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 }); }
  const { serviceId, modelId, history, context, anchor } = body;
  if (!history?.length) {
    return new Response(JSON.stringify({ error: 'history required' }), { status: 400 });
  }
  let provider;
  try {
    const cfg = resolveServerProvider(serviceId);
    provider = buildServerProvider(cfg, serviceId);
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : 'provider config error',
    }), { status: 500 });
  }
  const iter = provider.chat({
    modelId,
    messages: buildChatPrompt(history, context ?? '', anchor),
    maxTokens: 2500,
  });
  return ndjsonResponse(iter);
}
```

- [ ] **Step 3: Build check**

```bash
npm run build
```
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/summarize src/app/api/ai/chat
git commit -m "feat: /api/ai/summarize 和 /api/ai/chat 路由（流式）"
```

---

### Task T2.19: SelectionPopover + inline streaming result

Wires the reader's selection event to a glass popover with 4 buttons. `[翻译]` and `[解释]` stream their result inline (under the selection). `[验证]` and `[深入]` instead dispatch a `aether-open-sidebar` window event that T2.20 listens for to open the AI sidebar.

Modifies P1's placeholder `SelectionPopover.tsx` (just an empty component) and `ChapterContent.tsx` (currently lacks selection emission). Adds `InlineResultBubble.tsx` and a minimal `GlassPanel.tsx` shared component.

**Files:**
- Modify: `src/components/reader/SelectionPopover.tsx`
- Modify: `src/components/reader/ChapterContent.tsx`
- Modify: `src/components/reader/ReaderView.tsx`
- Modify: `src/stores/readerStore.ts` (add selection state)
- Create: `src/components/reader/InlineResultBubble.tsx`
- Create: `src/components/shared/GlassPanel.tsx`

- [ ] **Step 1: Add selection state to `src/stores/readerStore.ts`**

Patch the store interface and the `create<...>` body so the bottom of the file becomes:

```typescript
'use client';
import { create } from 'zustand';
import type { Book, Chapter } from '@/types/domain';

export interface SelectionInfo {
  text: string;
  rect: DOMRect;
}

interface ReaderState {
  book: Book | null;
  chapters: Chapter[];
  currentChapterId: string | null;
  selection: SelectionInfo | null;
  setBook: (b: Book) => void;
  setChapters: (c: Chapter[]) => void;
  setChapter: (id: string) => void;
  setSelection: (s: SelectionInfo | null) => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  book: null,
  chapters: [],
  currentChapterId: null,
  selection: null,
  setBook: (book) => set({ book }),
  setChapters: (chapters) => set({
    chapters,
    currentChapterId: chapters[0]?.id ?? null,
  }),
  setChapter: (currentChapterId) => set({ currentChapterId, selection: null }),
  setSelection: (selection) => set({ selection }),
}));
```

- [ ] **Step 2: Write `src/components/shared/GlassPanel.tsx`**

```typescript
'use client';
import clsx from 'clsx';
import type { ReactNode, HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function GlassPanel({ children, className, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={clsx(
        'rounded-2xl border border-border bg-surface-elevated',
        'shadow-[0_8px_32px_rgba(0,0,0,0.06)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
```

Note: P2 uses a plain elevated surface; the actual glass blur/saturate effect is added in P5's polish phase (per UI design philosophy section 7).

- [ ] **Step 3: Rewrite `src/components/reader/SelectionPopover.tsx`**

```typescript
'use client';
import { useEffect } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { useReaderStore } from '@/stores/readerStore';

export type PopoverAction = 'translate' | 'explain' | 'verify' | 'deep';

interface Props {
  onAction: (a: PopoverAction) => void;
}

export function SelectionPopover({ onAction }: Props) {
  const { selection, setSelection } = useReaderStore();

  useEffect(() => {
    if (!selection) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-selection-popover]')) setSelection(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [selection, setSelection]);

  if (!selection) return null;
  const top = selection.rect.top + window.scrollY - 52;
  const left = selection.rect.left + window.scrollX + selection.rect.width / 2;

  const buttons: { id: PopoverAction; label: string }[] = [
    { id: 'translate', label: '翻译' },
    { id: 'explain',   label: '解释' },
    { id: 'verify',    label: '验证' },
    { id: 'deep',      label: '深入' },
  ];

  return (
    <div
      data-selection-popover
      className="absolute z-40 -translate-x-1/2"
      style={{ top, left }}
    >
      <GlassPanel className="px-2 py-1 flex gap-1">
        {buttons.map(b => (
          <button
            key={b.id}
            onClick={() => onAction(b.id)}
            className="px-3 py-1.5 text-sm rounded-md text-foreground hover:bg-foreground/5 transition"
          >
            {b.label}
          </button>
        ))}
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/reader/InlineResultBubble.tsx`**

```typescript
'use client';
import { GlassPanel } from '@/components/shared/GlassPanel';

interface Props {
  anchorRect: DOMRect;
  text: string;
  streaming: boolean;
  onClose: () => void;
  onDeepDive: () => void;
}

export function InlineResultBubble({ anchorRect, text, streaming, onClose, onDeepDive }: Props) {
  const top = anchorRect.bottom + window.scrollY + 12;
  const left = anchorRect.left + window.scrollX;
  return (
    <div className="absolute z-40 w-[360px]" style={{ top, left }}>
      <GlassPanel className="p-4 max-h-[280px] overflow-y-auto">
        <div className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
          {text}
          {streaming && <span className="inline-block w-1 h-4 bg-foreground/40 ml-0.5 animate-pulse" />}
        </div>
        <div className="mt-3 flex gap-3 text-xs">
          <button onClick={onDeepDive} className="text-accent hover:text-accent-hover">深入对话 →</button>
          <button onClick={onClose} className="text-muted hover:text-foreground ml-auto">关闭</button>
        </div>
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 5: Modify `src/components/reader/ChapterContent.tsx`**

Replace its body with one that emits selection to the store on `mouseup`:

```typescript
'use client';
import { useReaderStore } from '@/stores/readerStore';

export function ChapterContent() {
  const { chapters, currentChapterId, setSelection } = useReaderStore();
  const chapter = chapters.find(c => c.id === currentChapterId);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || text.length > 600) { setSelection(null); return; }
    const range = sel?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (rect && rect.width > 0) setSelection({ text, rect });
  };

  if (!chapter) return <div className="text-muted text-center py-20">选择一个章节</div>;
  return (
    <article
      onMouseUp={handleMouseUp}
      className="max-w-[720px] mx-auto font-serif text-foreground"
      style={{ fontSize: 'var(--reader-font-size)', lineHeight: 'var(--reader-line-height)' }}
    >
      <h1 className="text-3xl mb-8">{chapter.title}</h1>
      <div className="whitespace-pre-wrap leading-relaxed">{chapter.content}</div>
    </article>
  );
}
```

- [ ] **Step 6: Modify `src/components/reader/ReaderView.tsx` to bootstrap AIService and wire popover → inline runs**

```typescript
'use client';
import { useEffect, useState, useMemo } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { IndexedDBCostRepo } from '@/adapters/storage/IndexedDBCostRepo';
import { TaskRouter } from '@/services/TaskRouter';
import { AIService } from '@/services/AIService';
import { ChapterNav } from './ChapterNav';
import { ChapterContent } from './ChapterContent';
import { SelectionPopover, type PopoverAction } from './SelectionPopover';
import { InlineResultBubble } from './InlineResultBubble';
import { AISidebar } from './AISidebar';
import { ChapterSummaryPanel } from './ChapterSummaryPanel';

export function ReaderView({ bookId }: { bookId: string }) {
  const {
    setBook, setChapters, chapters, currentChapterId,
    selection, setSelection,
  } = useReaderStore();
  const [inline, setInline] = useState<{ rect: DOMRect; text: string; streaming: boolean } | null>(null);

  const ai = useMemo(() => new AIService({
    router: new TaskRouter(new IndexedDBConfigRepo()),
    timeline: new IndexedDBTimelineRepo(),
    cost: new IndexedDBCostRepo(),
  }), []);

  useEffect(() => {
    (async () => {
      const b = await new IndexedDBBookRepo().get(bookId);
      if (b) setBook(b);
      const ch = await new IndexedDBChapterRepo().listByBook(bookId);
      setChapters(ch);
    })();
  }, [bookId, setBook, setChapters]);

  const currentChapter = chapters.find(c => c.id === currentChapterId);

  const runInline = async (action: 'translate' | 'explain') => {
    if (!selection || !currentChapter) return;
    const rect = selection.rect;
    const text = selection.text;
    setInline({ rect, text: '', streaming: true });
    setSelection(null);
    try {
      const iter = action === 'translate'
        ? ai.translate({ bookId, chapterId: currentChapter.id, text })
        : ai.explain({ bookId, chapterId: currentChapter.id, text, context: currentChapter.content });
      let acc = '';
      for await (const c of iter) {
        if (c.type === 'text' && c.text) {
          acc += c.text;
          setInline({ rect, text: acc, streaming: true });
        } else if (c.type === 'error' && c.error) {
          setInline({ rect, text: `错误: ${c.error}`, streaming: false });
          return;
        }
      }
      setInline({ rect, text: acc, streaming: false });
    } catch (e) {
      setInline({ rect, text: `错误: ${e instanceof Error ? e.message : '未知'}`, streaming: false });
    }
  };

  const handleAction = (a: PopoverAction) => {
    if (!selection) return;
    if (a === 'translate' || a === 'explain') {
      void runInline(a);
    } else {
      window.dispatchEvent(new CustomEvent('aether-open-sidebar', {
        detail: { action: a, text: selection.text },
      }));
      setSelection(null);
    }
  };

  return (
    <div className="relative flex h-screen">
      <aside className="w-72 shrink-0 border-r border-divider p-4 overflow-y-auto">
        <ChapterNav />
      </aside>
      <main className="flex-1 overflow-y-auto py-12 px-8 relative">
        <ChapterContent />
      </main>
      <SelectionPopover onAction={handleAction} />
      {inline && (
        <InlineResultBubble
          anchorRect={inline.rect}
          text={inline.text}
          streaming={inline.streaming}
          onClose={() => setInline(null)}
          onDeepDive={() => {
            window.dispatchEvent(new CustomEvent('aether-open-sidebar', {
              detail: { action: 'deep', text: inline.text },
            }));
            setInline(null);
          }}
        />
      )}
      <AISidebar ai={ai} bookId={bookId} />
      <ChapterSummaryPanel ai={ai} bookId={bookId} />
    </div>
  );
}
```

- [ ] **Step 7: Build check**

```bash
npm run build
```
Expected: build succeeds (AISidebar / ChapterSummaryPanel referenced; they will be implemented in T2.20).

If `AISidebar` and `ChapterSummaryPanel` from P1 are still placeholder stubs that don't accept `ai` / `bookId` props, mark this step as expected-to-fail and finish the build only after T2.20.

- [ ] **Step 8: Commit**

```bash
git add src/components/reader src/components/shared src/stores/readerStore.ts
git commit -m "feat: SelectionPopover + 划词内联流式结果"
```

---

### Task T2.20: AISidebar + ChapterSummaryPanel (verify / deep chat / summary)

Implements the two glass panels on the right side: AISidebar (verify result + multi-turn chat) and ChapterSummaryPanel (one-click章节总结). Both listen to the store and to the `aether-open-sidebar` window event from T2.19.

**Files:**
- Modify (replace placeholder): `src/components/reader/AISidebar.tsx`
- Modify (replace placeholder): `src/components/reader/ChapterSummaryPanel.tsx`
- Create: `src/components/reader/AIMessage.tsx`

- [ ] **Step 1: Write `src/components/reader/AIMessage.tsx`**

```typescript
'use client';
import clsx from 'clsx';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export function AIMessage({ role, content, streaming }: Props) {
  return (
    <div className={clsx(
      'rounded-xl px-4 py-3 text-sm',
      role === 'user'
        ? 'bg-accent/10 text-foreground self-end max-w-[80%]'
        : 'bg-surface-elevated text-foreground self-start max-w-[95%]',
    )}>
      <div className="whitespace-pre-wrap leading-relaxed">
        {content}
        {streaming && <span className="inline-block w-1 h-4 bg-foreground/40 ml-0.5 animate-pulse" />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/components/reader/AISidebar.tsx`**

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { AIMessage } from './AIMessage';
import { useReaderStore } from '@/stores/readerStore';
import type { AIService } from '@/services/AIService';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Props {
  ai: AIService;
  bookId: string;
}

export function AISidebar({ ai, bookId }: Props) {
  const { chapters, currentChapterId } = useReaderStore();
  const chapter = chapters.find(c => c.id === currentChapterId);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [anchorText, setAnchorText] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const threadIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { action: 'verify' | 'deep'; text: string } | undefined;
      if (!detail || !chapter) return;
      setOpen(true);
      setAnchorText(detail.text);
      threadIdRef.current = `thread-${crypto.randomUUID()}`;
      if (detail.action === 'verify') void runVerify(detail.text);
      else void runDeep(detail.text);
    };
    window.addEventListener('aether-open-sidebar', handler);
    return () => window.removeEventListener('aether-open-sidebar', handler);
  }, [chapter, ai, bookId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const runVerify = async (text: string) => {
    if (!chapter) return;
    setBusy(true);
    setMessages([
      { role: 'user', content: `请验证：${text}` },
      { role: 'assistant', content: '', streaming: true },
    ]);
    try {
      let acc = '';
      for await (const c of ai.verify({
        bookId, chapterId: chapter.id, text, context: chapter.content,
        threadId: threadIdRef.current ?? undefined,
      })) {
        if (c.type === 'text' && c.text) {
          acc += c.text;
          setMessages([
            { role: 'user', content: `请验证：${text}` },
            { role: 'assistant', content: acc, streaming: true },
          ]);
        } else if (c.type === 'error' && c.error) {
          setMessages([
            { role: 'user', content: `请验证：${text}` },
            { role: 'assistant', content: `错误: ${c.error}`, streaming: false },
          ]);
          return;
        }
      }
      setMessages([
        { role: 'user', content: `请验证：${text}` },
        { role: 'assistant', content: acc, streaming: false },
      ]);
    } finally { setBusy(false); }
  };

  const runDeep = async (text: string) => {
    if (!chapter) return;
    setBusy(true);
    const userMsg = `就这段内容深入聊聊：${text}`;
    setMessages([
      { role: 'user', content: userMsg },
      { role: 'assistant', content: '', streaming: true },
    ]);
    try {
      let acc = '';
      for await (const c of ai.chat({
        bookId, chapterId: chapter.id,
        history: [{ role: 'user', content: userMsg }],
        context: chapter.content,
        anchor: { originalText: text, type: 'explain' },
        threadId: threadIdRef.current ?? undefined,
      })) {
        if (c.type === 'text' && c.text) {
          acc += c.text;
          setMessages(m => {
            const last = m[m.length - 1];
            return [...m.slice(0, -1), { ...last, content: acc, streaming: true }];
          });
        }
      }
      setMessages(m => {
        const last = m[m.length - 1];
        return [...m.slice(0, -1), { ...last, streaming: false }];
      });
    } finally { setBusy(false); }
  };

  const sendFollowup = async () => {
    if (!input.trim() || !chapter || busy) return;
    const userMsg = input.trim();
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(m => [
      ...m,
      { role: 'user', content: userMsg },
      { role: 'assistant', content: '', streaming: true },
    ]);
    setInput(''); setBusy(true);
    try {
      let acc = '';
      for await (const c of ai.chat({
        bookId, chapterId: chapter.id,
        history: [...history, { role: 'user', content: userMsg }],
        context: chapter.content,
        anchor: anchorText ? { originalText: anchorText, type: 'explain' } : undefined,
        threadId: threadIdRef.current ?? undefined,
      })) {
        if (c.type === 'text' && c.text) {
          acc += c.text;
          setMessages(m => {
            const last = m[m.length - 1];
            return [...m.slice(0, -1), { ...last, content: acc, streaming: true }];
          });
        }
      }
      setMessages(m => {
        const last = m[m.length - 1];
        return [...m.slice(0, -1), { ...last, streaming: false }];
      });
    } finally { setBusy(false); }
  };

  if (!open) return null;
  return (
    <aside className="absolute right-0 top-0 h-full w-[420px] p-4 z-30">
      <GlassPanel className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-foreground">AI 对话</div>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground text-sm">×</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 flex flex-col">
          {messages.map((m, i) => (
            <AIMessage key={i} role={m.role} content={m.content} streaming={m.streaming} />
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); void sendFollowup();
              }
            }}
            disabled={busy}
            placeholder="追问..."
            className="flex-1 px-3 py-2 rounded-md bg-surface border border-border text-sm text-foreground"
          />
          <button
            disabled={busy || !input.trim()}
            onClick={() => void sendFollowup()}
            className="px-4 py-2 rounded-md bg-accent text-white text-sm disabled:opacity-40"
          >发送</button>
        </div>
      </GlassPanel>
    </aside>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/reader/ChapterSummaryPanel.tsx`**

```typescript
'use client';
import { useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { useReaderStore } from '@/stores/readerStore';
import type { AIService } from '@/services/AIService';

interface Props {
  ai: AIService;
  bookId: string;
}

export function ChapterSummaryPanel({ ai, bookId }: Props) {
  const { chapters, currentChapterId } = useReaderStore();
  const chapter = chapters.find(c => c.id === currentChapterId);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!chapter) return;
    setOpen(true); setBusy(true); setContent('');
    try {
      let acc = '';
      for await (const c of ai.summarize({
        bookId, chapterId: chapter.id, chapterContent: chapter.content,
      })) {
        if (c.type === 'text' && c.text) {
          acc += c.text;
          setContent(acc);
        } else if (c.type === 'error' && c.error) {
          setContent(`错误: ${c.error}`); return;
        }
      }
    } catch (e) {
      setContent(`错误: ${e instanceof Error ? e.message : '未知'}`);
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        onClick={() => void run()}
        disabled={!chapter || busy}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-accent text-white text-sm shadow-lg hover:bg-accent-hover disabled:opacity-40"
      >章节总结</button>
      {open && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-[520px] max-h-[60vh]">
          <GlassPanel className="p-5 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">{chapter?.title} · 章节总结</div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">×</button>
            </div>
            <div className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
              {content}
              {busy && <span className="inline-block w-1 h-4 bg-foreground/40 ml-0.5 animate-pulse" />}
            </div>
          </GlassPanel>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Build check**

```bash
npm run build
```
Expected: succeeds.

- [ ] **Step 5: End-to-end manual smoke test (requires real `ANTHROPIC_API_KEY` in `.env.local`)**

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local   # fill in real key
npm run dev
```
Then in a browser:
1. http://localhost:3000 — book list should show after upload
2. Upload a real PDF
3. Click into the book
4. Select a Chinese term in the chapter content → popover appears
5. Click [翻译] → inline bubble streams the translation
6. Click [解释] on another selection → inline streams structured explanation
7. Click [验证] on a sentence → AISidebar opens, streams a Markdown verify result with URL citations
8. Type a follow-up question in the sidebar → streams a chat answer
9. Click bottom [章节总结] → panel opens, streams the summary
10. Verify the timeline writes succeeded: open DevTools → Application → IndexedDB → `aether-reader-flow` → `timeline` table → see one entry per AI call

If any of 5-10 fail, log the failing route's network response, error chunk, or console error before moving to T3.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all green (P1 + P2 unit tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/reader
git commit -m "feat: AISidebar + ChapterSummaryPanel 流式对话与整章摘要"
```

---

**P2 Done.** At end of P2:
- All 5 AI capabilities (translate / explain / verify / summarize / chat) are reachable from the reader UI
- Every AI call writes a `TimelineEntry` to IndexedDB and a `CostRecord` for accounting
- `TaskRouter` resolves models from `ConfigRepo` (with built-in defaults)
- Anthropic + OpenAI-compatible providers both implemented
- Hard-coded `ANTHROPIC_API_KEY` from `.env.local` is the only auth path — Settings UI / master-password unlock / per-service config is owned by P4
- Glass / theme polish is intentionally minimal — P5 owns the visual layer

---
