/**
 * @fileoverview API request/response shapes for `/api/ai/*` routes.
 *
 * Streaming model: routes emit NDJSON (newline-delimited JSON) where each
 * line is a serialized `ChatChunk`. Clients accumulate `text` chunks for the
 * displayed answer and read the final `usage` chunk to record cost.
 *
 * Why NDJSON and not SSE? NDJSON parses with one `split('\n')` per chunk and
 * needs no `data:` prefix grammar. We trade SSE auto-reconnect for simpler
 * server code; the app never reconnects mid-stream anyway (it just restarts).
 */
import type { SourceRef, Confidence, TaskType } from './domain';

/**
 * One unit of a streaming response. Exactly one of `text`, `usage`, or
 * `error` is populated per chunk.
 */
export interface ChatChunk {
  type: 'text' | 'tool_use' | 'error' | 'usage';
  /** Populated when `type === 'text'`. Concatenate in order for full answer. */
  text?: string;
  /** Populated when `type === 'usage'`. Always the LAST chunk before close. */
  inputTokens?: number;
  /** Populated when `type === 'usage'`. */
  outputTokens?: number;
  /** Populated when `type === 'error'`. Stream ends after this chunk. */
  error?: string;
}

/** Common fields every AI request carries for billing + timeline persistence. */
export interface AIRequestBase {
  serviceId: string;
  modelId: string;
  bookId: string;
  chapterId: string;
}

export interface TranslateRequest extends AIRequestBase {
  text: string;
}

export interface ExplainRequest extends AIRequestBase {
  text: string;
  /** Surrounding paragraph(s) — feeds the prompt's "in this chapter" section. */
  context: string;
}

export interface VerifyRequest extends AIRequestBase {
  text: string;
  context: string;
}

export interface SummarizeRequest extends AIRequestBase {
  chapterContent: string;
}

export interface ChatRequest extends AIRequestBase {
  threadId: string;
  /** Prior turns (oldest → newest). Empty array for new threads. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Original selection that anchors this thread, if any. */
  anchor?: { originalText: string; type: TaskType };
}

/**
 * Final JSON the verify endpoint emits AFTER all `text` chunks. Parsed
 * client-side from the `text` accumulator (the AI is prompted to emit a
 * JSON block last).
 */
export interface VerifyResponseFinal {
  summary: string;
  supporting: SourceRef[];
  opposing: SourceRef[];
  verdict: 'widely_accepted' | 'contested' | 'refuted' | 'insufficient';
  confidence: Confidence;
}
