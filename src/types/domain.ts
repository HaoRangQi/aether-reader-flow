/**
 * @fileoverview Core domain types for Aether Reader Flow.
 *
 * These types model the bounded context of the reading-assist domain:
 * - Books and chapters (the input)
 * - Timeline entries (the user-AI interaction log, which IS the "thinking document")
 * - Model services + task routing (how AI calls are dispatched)
 * - Cost records (every AI call is accounted)
 *
 * Anything added here is also persisted to IndexedDB via Dexie. Mutating the
 * shape requires bumping Dexie schema version in `src/adapters/storage/db.ts`
 * AND providing a migration. See `db.ts` JSDoc for details.
 */

/** The five AI task types the application supports. */
export type TaskType = 'translate' | 'explain' | 'verify' | 'summarize' | 'chat';

/** Coarse language detection used to route prompts. */
export type Language = 'zh' | 'en' | 'mixed';

/** User-created reading mark types. */
export type AnnotationType = 'highlight' | 'note';

/** Semantic highlight colors used in reading and export workflows. */
export type HighlightColor = 'important' | 'question' | 'insight' | 'todo';

/** AI's self-reported confidence on a verify result. */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * A book in the library. Persistence root for an uploaded PDF.
 *
 * `fileBlob` holds the original PDF for re-rendering or re-export. Optional
 * because legacy entries (or future imports) may omit it.
 */
export interface Book {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  totalPages: number;
  totalChapters: number;
  uploadedAt: Date;
  lastReadAt?: Date;
  /** Soft-hide from the default library view without deleting reading data. */
  archivedAt?: Date;
  language: Language;
  fileBlob?: Blob;
}

/**
 * A chapter is the unit of reading. `content` is the concatenated text of
 * all pages between `startPage` and `endPage`. `summaryCache` is populated by
 * the F6 chapter-summary feature and reused on subsequent opens.
 */
export interface Chapter {
  id: string;
  bookId: string;
  /** 1-based ordering within the book. */
  orderIndex: number;
  title: string;
  startPage: number;
  endPage: number;
  content: string;
  /** CJK chars + English words (rough), used for cost preview. */
  wordCount: number;
  summaryCache?: ChapterSummary;
}

/** Output of the F6 chapter-summary AI call. */
export interface ChapterSummary {
  corePoints: string[];
  keyConcepts: string[];
  argumentFlow: string;
  openQuestions: string[];
  generatedAt: Date;
  modelUsed: string;
}

/**
 * A durable anchor into chapter text. Offsets are character offsets within
 * `Chapter.content`; `quote` stores the selected text for drift detection.
 */
export interface TextAnchor {
  start: number;
  end: number;
  quote: string;
  page?: number;
}

/**
 * User-created reading markup. This is separate from TimelineEntry so manual
 * reading intent can exist without an AI call, while still sharing the same
 * text-anchor model for future jump-back and export.
 */
export interface Annotation {
  id: string;
  bookId: string;
  chapterId: string;
  type: AnnotationType;
  anchor: TextAnchor;
  color: HighlightColor;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Durable reading position for one book. `chapterProgress` is the current
 * chapter's vertical scroll ratio; `overallProgress` rolls that into the
 * whole-book chapter count for library and continue-reading UI.
 */
export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  chapterOrderIndex: number;
  chapterTitle: string;
  totalChapters: number;
  chapterProgress: number;
  overallProgress: number;
  updatedAt: Date;
}

/** A contiguous slice of active reading time captured in the reader. */
export interface ReadingSession {
  id: string;
  bookId: string;
  chapterId: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
}

/** Cited source returned by a verify call. */
export interface SourceRef {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: Date;
}

/**
 * One unit of user-AI interaction. The complete set of these for a book IS
 * the "thinking document" — exported as Markdown/HTML in P3.
 *
 * - `persona` is a P2-reserved field (always `"general"` in MVP).
 * - `comparisonSessionId` is a P2-reserved field for the future "multi-AI
 *   compare" feature; always undefined in MVP.
 */
export interface TimelineEntry {
  id: string;
  bookId: string;
  chapterId: string;
  timestamp: Date;
  type: TaskType;
  /** The exact passage the user selected. Empty string for chapter-level ops. */
  originalText: string;
  /** Stable source anchor for jump-back when this entry came from a selection. */
  anchor?: TextAnchor;
  page?: number;
  /** User's follow-up question (chat) or empty for single-shot ops. */
  userInput?: string;
  aiModel: string;
  aiResponse: string;
  /** Populated only for `type: 'verify'`. */
  sources?: SourceRef[];
  /** Populated only for `type: 'verify'`. */
  confidence?: Confidence;
  costTokens: { input: number; output: number };
  /** Monetary cost in USD at the time of the call. Frozen — never recomputed. */
  costAmount: number;
  /** Reading companion persona id. MVP always `"general"`. */
  persona: string;
  /** Groups follow-up chats under the same anchor. */
  threadId?: string;
  /** P2-reserved: multi-AI comparison session id. */
  comparisonSessionId?: string;
}

/** Capability metadata for a model. Pricing is per 1M tokens, USD. */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsWebSearch: boolean;
  pricing: { input: number; output: number };
}

/**
 * A user-configured AI service (Cherry Studio-style). API keys are stored
 * as AES-GCM ciphertext (`apiKeyCipher`) derived from a master password —
 * never persisted in plaintext or sent to any non-user-controlled endpoint.
 */
export interface ModelService {
  id: string;
  name: string;
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  /** AES-GCM envelope JSON, see `src/services/CryptoService.ts`. */
  apiKeyCipher: string;
  enabled: boolean;
  enabledModels: string[];
  createdAt: Date;
}

/** Reference to one specific model in one specific service. */
export interface ModelRef {
  serviceId: string;
  modelId: string;
}

/** Maps each task type to its default model. User-editable from settings. */
export interface TaskRouting {
  translate: ModelRef;
  explain: ModelRef;
  verify: ModelRef;
  summarize: ModelRef;
  chat: ModelRef;
}

/** A single accounting record. Used for today/this-month totals + audit. */
export interface CostRecord {
  id: string;
  timestamp: Date;
  model: string;
  tokens: { input: number; output: number };
  amountUSD: number;
  taskType: TaskType;
}
