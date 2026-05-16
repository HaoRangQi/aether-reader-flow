/**
 * @fileoverview AIService — the client-side dispatcher for AI calls.
 *
 * Responsibilities:
 *   1. Resolve which provider (ModelService + modelId) to use for a task,
 *      either from the task routing config or from an explicit override.
 *   2. Decrypt the API key via KeyVault.
 *   3. POST to the corresponding /api/ai/<task> route with the streaming
 *      envelope. Parse NDJSON chunks back into `ChatChunk`.
 *   4. Persist a TimelineEntry on completion.
 *   5. Record a CostRecord on completion.
 *
 * Exposes one method per task type. Each returns an async generator of
 * `ChatChunk` that the UI can consume directly (for streaming text) and
 * an awaitable `done` Promise that resolves with the persisted TimelineEntry.
 */
'use client';

import type { ChatChunk } from '@/types/api';
import type {
  TaskType,
  TimelineEntry,
  ModelRef,
  ModelService,
  SourceRef,
  Confidence,
} from '@/types/domain';
import type { TimelineRepo, ModelServiceRepo } from '@/adapters/storage/interfaces';
import type { CostMeter } from './CostMeter';
import type { KeyVault } from './KeyVault';
import type { ConfigService } from './ConfigService';
import type { VerifyResponseFinal } from '@/types/api';

export interface AICallOptions {
  /** Per-call model override; falls back to task routing config. */
  modelOverride?: ModelRef;
  /** Caps output tokens for this call. */
  maxTokens?: number;
}

interface DispatchArgs {
  taskType: TaskType;
  bookId: string;
  chapterId: string;
  originalText: string;
  /** Body to POST. Must NOT contain envelope fields (added by dispatcher). */
  body: Record<string, unknown>;
  /** User-typed input for the chat task. */
  userInput?: string;
  /** Anchor id for grouping follow-up chats. */
  threadId?: string;
  options?: AICallOptions;
}

interface DispatchResult {
  chunks: AsyncGenerator<ChatChunk, void, void>;
  /** Resolves after the stream closes with the persisted TimelineEntry. */
  done: Promise<TimelineEntry>;
}

const TASK_TO_PATH: Record<TaskType, string> = {
  translate: '/api/ai/translate',
  explain: '/api/ai/explain',
  verify: '/api/ai/verify',
  summarize: '/api/ai/summarize',
  chat: '/api/ai/chat',
};

export class AIService {
  constructor(
    private services: ModelServiceRepo,
    private vault: KeyVault,
    private timeline: TimelineRepo,
    private cost: CostMeter,
    private config: ConfigService,
  ) {}

  // ---- Public per-task entry points ----------------------------------------

  translate(args: {
    text: string;
    bookId: string;
    chapterId: string;
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'translate',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.text,
      body: { text: args.text },
      options: args.options,
    });
  }

  explain(args: {
    text: string;
    context: string;
    bookId: string;
    chapterId: string;
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'explain',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.text,
      body: { text: args.text, context: args.context },
      options: args.options,
    });
  }

  verify(args: {
    text: string;
    context: string;
    bookId: string;
    chapterId: string;
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'verify',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.text,
      body: { text: args.text, context: args.context },
      options: args.options,
    });
  }

  summarize(args: {
    chapterTitle: string;
    chapterContent: string;
    bookId: string;
    chapterId: string;
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'summarize',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: '',
      body: {
        chapterTitle: args.chapterTitle,
        chapterContent: args.chapterContent,
      },
      options: args.options,
    });
  }

  chat(args: {
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    anchor?: { originalText: string; type: TaskType };
    threadId: string;
    bookId: string;
    chapterId: string;
    options?: AICallOptions;
  }): DispatchResult {
    const lastUser =
      [...args.history].reverse().find(m => m.role === 'user')?.content ?? '';
    return this.dispatch({
      taskType: 'chat',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.anchor?.originalText ?? '',
      userInput: lastUser,
      threadId: args.threadId,
      body: {
        history: args.history,
        anchor: args.anchor,
      },
      options: args.options,
    });
  }

  /** Helper: parse the final verify JSON block out of an answer string. */
  static parseVerifyResponse(text: string): VerifyResponseFinal | null {
    const fence = text.match(/```json\s*([\s\S]+?)```/);
    const raw = fence ? fence[1] : text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
      const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<VerifyResponseFinal>;
      if (!obj.verdict || !obj.confidence) return null;
      return {
        summary: obj.summary ?? '',
        supporting: Array.isArray(obj.supporting) ? (obj.supporting as SourceRef[]) : [],
        opposing: Array.isArray(obj.opposing) ? (obj.opposing as SourceRef[]) : [],
        verdict: obj.verdict,
        confidence: obj.confidence,
      };
    } catch {
      return null;
    }
  }

  // ---- Dispatcher ---------------------------------------------------------

  private dispatch(args: DispatchArgs): DispatchResult {
    let doneResolve: (e: TimelineEntry) => void;
    let doneReject: (e: Error) => void;
    const done = new Promise<TimelineEntry>((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    const self = this;
    async function* gen(): AsyncGenerator<ChatChunk, void, void> {
      try {
        const ref = args.options?.modelOverride ?? (await self.resolveModelRef(args.taskType));
        const service = await self.loadService(ref.serviceId);
        const apiKey = await self.vault.getApiKey(ref.serviceId);

        const envelope = {
          ...args.body,
          serviceId: service.id,
          modelId: ref.modelId,
          protocol: service.protocol,
          baseUrl: service.baseUrl,
          apiKey,
          maxTokens: args.options?.maxTokens,
        };

        const res = await fetch(TASK_TO_PATH[args.taskType], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let aiResponse = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let streamError: string | null = null;

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let chunk: ChatChunk;
            try {
              chunk = JSON.parse(line) as ChatChunk;
            } catch {
              continue;
            }
            if (chunk.type === 'text' && chunk.text) aiResponse += chunk.text;
            if (chunk.type === 'usage') {
              inputTokens = chunk.inputTokens ?? 0;
              outputTokens = chunk.outputTokens ?? 0;
            }
            if (chunk.type === 'error') streamError = chunk.error ?? 'stream error';
            yield chunk;
          }
        }

        if (streamError) throw new Error(streamError);

        const entry = await self.persistEntry({
          args,
          modelId: ref.modelId,
          aiResponse,
          inputTokens,
          outputTokens,
        });
        doneResolve(entry);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        yield { type: 'error', error: err.message };
        doneReject(err);
      }
    }

    return { chunks: gen(), done };
  }

  private async resolveModelRef(taskType: TaskType): Promise<ModelRef> {
    const routing = await this.config.getTaskRouting();
    return routing[taskType];
  }

  private async loadService(serviceId: string): Promise<ModelService> {
    const svc = await this.services.get(serviceId);
    if (!svc) throw new Error(`Unknown model service: ${serviceId}`);
    if (!svc.enabled) throw new Error(`Service "${svc.name}" is disabled`);
    return svc;
  }

  private async persistEntry(input: {
    args: DispatchArgs;
    modelId: string;
    aiResponse: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<TimelineEntry> {
    const { args, modelId, aiResponse, inputTokens, outputTokens } = input;
    const amountUSD = this.cost.estimateUSD(modelId, inputTokens, outputTokens);

    // For verify, try to parse sources + confidence out of the JSON envelope.
    let sources: SourceRef[] | undefined;
    let confidence: Confidence | undefined;
    if (args.taskType === 'verify') {
      const parsed = AIService.parseVerifyResponse(aiResponse);
      if (parsed) {
        sources = [...parsed.supporting, ...parsed.opposing];
        confidence = parsed.confidence;
      }
    }

    const entry: TimelineEntry = {
      id: `tl-${crypto.randomUUID()}`,
      bookId: args.bookId,
      chapterId: args.chapterId,
      timestamp: new Date(),
      type: args.taskType,
      originalText: args.originalText,
      userInput: args.userInput,
      aiModel: modelId,
      aiResponse,
      sources,
      confidence,
      costTokens: { input: inputTokens, output: outputTokens },
      costAmount: amountUSD,
      persona: 'general',
      threadId: args.threadId,
    };

    await this.timeline.create(entry);
    await this.cost.record({
      model: modelId,
      tokens: { input: inputTokens, output: outputTokens },
      amountUSD,
      taskType: args.taskType,
    });
    return entry;
  }
}
