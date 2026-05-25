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
import { compactChatMemory } from '@/lib/chat-memory';

export interface AICallOptions {
  /** Per-call model override; falls back to task routing config. */
  modelOverride?: ModelRef;
  /** Caps output tokens for this call. */
  maxTokens?: number;
  /** Abort signal for user-triggered cancellation. */
  signal?: AbortSignal;
  /** Client-side timeout in milliseconds. */
  timeoutMs?: number;
  /** Retries pre-stream transient failures. Defaults to 1. */
  retryCount?: number;
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
  anchor?: { start: number; end: number; page?: number };
  options?: AICallOptions;
}

interface DispatchResult {
  chunks: AsyncGenerator<ChatChunk, void, void>;
  /** Resolves after the stream closes with the persisted TimelineEntry. */
  done: Promise<TimelineEntry>;
  /** Cancels the in-flight request. */
  cancel: () => void;
}

export type AIErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'validation'
  | 'network'
  | 'config'
  | 'unknown';

export interface AIErrorInfo {
  kind: AIErrorKind;
  message: string;
  retryable: boolean;
  status?: number;
}

export class AIServiceError extends Error {
  constructor(
    readonly info: AIErrorInfo,
    options?: { cause?: unknown },
  ) {
    super(info.message);
    this.name = 'AIServiceError';
    this.cause = options?.cause;
  }
}

const HTTP_ERROR_PREFIX = 'AI_HTTP_ERROR';
const DEFAULT_RETRY_COUNT = 1;
const VERIFY_VERDICTS = new Set([
  'widely_accepted',
  'contested',
  'refuted',
  'insufficient',
]);
const VERIFY_CONFIDENCE = new Set(['high', 'medium', 'low']);

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
    anchor?: { start: number; end: number; page?: number };
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'translate',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.text,
      anchor: args.anchor,
      body: { text: args.text },
      options: args.options,
    });
  }

  explain(args: {
    text: string;
    context: string;
    bookId: string;
    chapterId: string;
    anchor?: { start: number; end: number; page?: number };
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'explain',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.text,
      anchor: args.anchor,
      body: { text: args.text, context: args.context },
      options: args.options,
    });
  }

  verify(args: {
    text: string;
    context: string;
    bookId: string;
    chapterId: string;
    anchor?: { start: number; end: number; page?: number };
    options?: AICallOptions;
  }): DispatchResult {
    return this.dispatch({
      taskType: 'verify',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.text,
      anchor: args.anchor,
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
    const compacted = compactChatMemory(args.history);
    return this.dispatch({
      taskType: 'chat',
      bookId: args.bookId,
      chapterId: args.chapterId,
      originalText: args.anchor?.originalText ?? '',
      userInput: lastUser,
      threadId: args.threadId,
      body: {
        history: compacted.history,
        anchor: args.anchor,
        ...(compacted.memorySummary ? { memorySummary: compacted.memorySummary } : {}),
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
      if (!isVerifyVerdict(obj.verdict) || !isVerifyConfidence(obj.confidence)) {
        return null;
      }
      return {
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        supporting: normalizeSourceRefs(obj.supporting),
        opposing: normalizeSourceRefs(obj.opposing),
        verdict: obj.verdict,
        confidence: obj.confidence,
      };
    } catch {
      return null;
    }
  }

  static classifyError(error: unknown, signal?: AbortSignal): AIErrorInfo {
    return classifyAIError(error, signal);
  }

  // ---- Dispatcher ---------------------------------------------------------

  private dispatch(args: DispatchArgs): DispatchResult {
    let doneResolve!: (e: TimelineEntry) => void;
    let doneReject!: (e: Error) => void;
    const done = new Promise<TimelineEntry>((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });
    done.catch(() => undefined);

    const controller = new AbortController();
    const chunks = streamAndPersist(this, args, doneResolve, doneReject, controller);
    return {
      chunks,
      done,
      cancel: () => controller.abort(new Error('AI request cancelled')),
    };
  }

  private async resolveModelRef(taskType: TaskType): Promise<ModelRef> {
    const routing = await this.config.getTaskRouting();
    return routing[taskType];
  }

  /** @internal */
  async _resolveModelRef(taskType: TaskType): Promise<ModelRef> {
    return this.resolveModelRef(taskType);
  }

  /** @internal */
  async _loadService(serviceId: string): Promise<ModelService> {
    return this.loadService(serviceId);
  }

  /** @internal */
  async _getApiKey(serviceId: string): Promise<string> {
    return this.vault.getApiKey(serviceId);
  }

  /** @internal — returns the user's custom system prompt for a task, or '' if none. */
  async _getPromptOverride(taskType: TaskType): Promise<string> {
    const overrides = await this.config.getPromptOverrides();
    return overrides[taskType] ?? '';
  }

  /** @internal */
  async _persistEntry(input: {
    args: DispatchArgs;
    modelId: string;
    aiResponse: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<TimelineEntry> {
    return this.persistEntry(input);
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
      anchor: args.anchor
        ? {
            start: args.anchor.start,
            end: args.anchor.end,
            quote: args.originalText,
            page: args.anchor.page,
          }
        : undefined,
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

function isVerifyVerdict(value: unknown): value is VerifyResponseFinal['verdict'] {
  return typeof value === 'string' && VERIFY_VERDICTS.has(value);
}

function isVerifyConfidence(value: unknown): value is Confidence {
  return typeof value === 'string' && VERIFY_CONFIDENCE.has(value);
}

function normalizeSourceRefs(value: unknown): SourceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(toSourceRef)
    .filter((source): source is SourceRef => source !== null);
}

function toSourceRef(value: unknown): SourceRef | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const { url, title, snippet } = source;
  const hasRequiredFields =
    typeof url === 'string' &&
    url.trim().length > 0 &&
    typeof title === 'string' &&
    typeof snippet === 'string';
  if (!hasRequiredFields) return null;

  let publishedAt: Date | undefined;
  if (source.publishedAt instanceof Date) {
    if (!Number.isFinite(source.publishedAt.getTime())) return null;
    publishedAt = source.publishedAt;
  } else if (typeof source.publishedAt === 'string') {
    const date = new Date(source.publishedAt);
    if (!Number.isFinite(date.getTime())) return null;
    publishedAt = date;
  } else if (source.publishedAt !== undefined) {
    return null;
  }

  return {
    url,
    title,
    snippet,
    ...(publishedAt ? { publishedAt } : {}),
  };
}

/**
 * Module-scope helper that runs the streaming dispatch. Lives outside the
 * class so it doesn't capture `this`, which lets us avoid `this`-aliasing.
 */
async function* streamAndPersist(
  svc: AIService,
  args: DispatchArgs,
  doneResolve: (e: TimelineEntry) => void,
  doneReject: (e: Error) => void,
  controller: AbortController,
): AsyncGenerator<ChatChunk, void, void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const externalSignal = args.options?.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }
  if (args.options?.timeoutMs && args.options.timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(new Error('AI request timed out')), args.options.timeoutMs);
  }

  try {
    const ref = args.options?.modelOverride ?? (await svc._resolveModelRef(args.taskType));
    const service = await svc._loadService(ref.serviceId);
    const apiKey = await svc._getApiKey(ref.serviceId);
    const systemPromptOverride = await svc._getPromptOverride(args.taskType);

    const envelope = {
      ...args.body,
      serviceId: service.id,
      modelId: ref.modelId,
      protocol: service.protocol,
      baseUrl: service.baseUrl,
      apiKey,
      maxTokens: args.options?.maxTokens,
      ...(systemPromptOverride ? { systemPromptOverride } : {}),
    };

    const retryCount = Math.max(0, args.options?.retryCount ?? DEFAULT_RETRY_COUNT);
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      let hasStreamedText = false;
      try {
        const res = await fetch(TASK_TO_PATH[args.taskType], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          throw httpStatusError(res.status, text || res.statusText);
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
            if (chunk.type === 'text' && chunk.text) {
              aiResponse += chunk.text;
              hasStreamedText = true;
              yield chunk;
              continue;
            }
            if (chunk.type === 'usage') {
              inputTokens = chunk.inputTokens ?? 0;
              outputTokens = chunk.outputTokens ?? 0;
              yield chunk;
              continue;
            }
            if (chunk.type === 'error') {
              streamError = chunk.error ?? 'stream error';
              continue;
            }
            yield chunk;
          }
        }

        if (streamError) throw new Error(streamError);

        const entry = await svc._persistEntry({
          args,
          modelId: ref.modelId,
          aiResponse,
          inputTokens,
          outputTokens,
        });
        doneResolve(entry);
        return;
      } catch (e) {
        const info = classifyAIError(e, controller.signal);
        const canRetry = !hasStreamedText && info.retryable && attempt < retryCount;
        if (canRetry) continue;
        throw new AIServiceError(info, { cause: e });
      }
    }
  } catch (e) {
    const info = classifyAIError(e, controller.signal);
    const err = e instanceof AIServiceError ? e : new AIServiceError(info, { cause: e });
    doneReject(err);
    yield {
      type: 'error',
      error: info.message,
      errorKind: info.kind,
      retryable: info.retryable,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
  }
}

function httpStatusError(status: number, detail: string): Error {
  return new Error(`${HTTP_ERROR_PREFIX}:${status}:${detail}`);
}

function classifyAIError(error: unknown, signal?: AbortSignal): AIErrorInfo {
  if (error instanceof AIServiceError) return error.info;

  const message = error instanceof Error ? error.message : String(error);
  const abortReason = signal?.aborted ? signal.reason : undefined;
  const abortMessage = abortReason instanceof Error ? abortReason.message : String(abortReason ?? '');

  if (signal?.aborted || message === 'AI request cancelled' || message === 'AI request timed out') {
    if (abortMessage.includes('timed out') || message.includes('timed out')) {
      return {
        kind: 'timeout',
        message: 'AI 请求超时。请稍后重试，或缩短选中文本/章节内容。',
        retryable: true,
      };
    }
    return {
      kind: 'cancelled',
      message: '已停止生成',
      retryable: false,
    };
  }

  const httpMatch = message.match(new RegExp(`^${HTTP_ERROR_PREFIX}:(\\d+):(.*)$`, 's'));
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    const detail = httpMatch[2]?.trim();
    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        status,
        message: 'AI 服务鉴权失败。请检查 API Key、服务配置或重新解锁后再试。',
        retryable: false,
      };
    }
    if (status === 429) {
      return {
        kind: 'rate_limit',
        status,
        message: 'AI 服务请求过于频繁或额度不足。请稍后重试。',
        retryable: true,
      };
    }
    if (status >= 500) {
      return {
        kind: 'server',
        status,
        message: 'AI 服务暂时不可用。系统已尝试自动重试，请稍后再试。',
        retryable: true,
      };
    }
    if (status >= 400) {
      return {
        kind: 'validation',
        status,
        message: detail
          ? `AI 请求参数有误：${detail}`
          : 'AI 请求参数有误。请调整输入内容后再试。',
        retryable: false,
      };
    }
  }

  if (
    /vault is locked|master password|api key|no api key|decrypt/i.test(message) ||
    /unauthorized|forbidden|invalid key/i.test(message)
  ) {
    return {
      kind: 'auth',
      message: 'AI 密钥不可用。请重新解锁或检查模型服务的 API Key 配置。',
      retryable: false,
    };
  }

  if (/unknown model service|disabled|routing|model service/i.test(message)) {
    return {
      kind: 'config',
      message: 'AI 模型配置不可用。请到设置中检查服务启用状态和任务路由。',
      retryable: false,
    };
  }

  if (/failed to fetch|network|load failed|fetch/i.test(message)) {
    return {
      kind: 'network',
      message: '网络连接异常。系统已尝试自动重试，请检查网络或稍后再试。',
      retryable: true,
    };
  }

  return {
    kind: 'unknown',
    message: message || 'AI 请求失败。请稍后重试。',
    retryable: false,
  };
}
