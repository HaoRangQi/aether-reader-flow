/**
 * @fileoverview Repository interfaces (the "ports" of the hexagonal architecture).
 *
 * Business logic depends only on these interfaces. The `IndexedDB*Repo`
 * classes are one adapter; a future `SQLite*Repo` adapter can replace them
 * without touching anything in `src/services/`.
 *
 * Conventions:
 * - All methods are async (storage may be remote in the future).
 * - `get()` returns `null` for not-found (no exceptions).
 * - `delete()` is idempotent (deleting a non-existent id is fine).
 * - Lists are ordered by domain semantics (e.g. `Books.list()` is reverse-
 *   chronological by `uploadedAt`; `Chapters.listByBook()` is by orderIndex).
 */
import type {
  Book,
  Chapter,
  Annotation,
  ReadingProgress,
  ReadingSession,
  TimelineEntry,
  ModelService,
  CostRecord,
  TaskType,
} from '@/types/domain';

/**
 * Input for `BookRepo.create`. The repo assigns `id` (unless given) and
 * `uploadedAt`. All other fields are required from the caller.
 */
export type BookInput = Omit<Book, 'id' | 'uploadedAt'> & { id?: string };

export interface BookRepo {
  create(input: BookInput): Promise<Book>;
  get(id: string): Promise<Book | null>;
  /** Reverse-chronological by `uploadedAt`. */
  list(): Promise<Book[]>;
  update(id: string, patch: Partial<Book>): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ChapterRepo {
  create(c: Chapter): Promise<void>;
  bulkCreate(chapters: Chapter[]): Promise<void>;
  get(id: string): Promise<Chapter | null>;
  /** Ascending by `orderIndex`. */
  listByBook(bookId: string): Promise<Chapter[]>;
  update(id: string, patch: Partial<Chapter>): Promise<void>;
  delete(id: string): Promise<void>;
}

export type AnnotationInput = Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export interface AnnotationRepo {
  create(input: AnnotationInput): Promise<Annotation>;
  get(id: string): Promise<Annotation | null>;
  /** Reverse-chronological by creation time. */
  listByBook(bookId: string): Promise<Annotation[]>;
  /** Ascending by anchor start, then creation time. */
  listByChapter(chapterId: string): Promise<Annotation[]>;
  update(id: string, patch: Partial<Omit<Annotation, 'id' | 'createdAt'>>): Promise<void>;
  delete(id: string): Promise<void>;
}

export type ReadingProgressInput = Omit<ReadingProgress, 'updatedAt'> & {
  updatedAt?: Date;
};

export interface ReadingProgressRepo {
  upsert(input: ReadingProgressInput): Promise<ReadingProgress>;
  get(bookId: string): Promise<ReadingProgress | null>;
  /** Progress rows for a set of books, keyed by bookId. */
  listByBooks(bookIds: string[]): Promise<Record<string, ReadingProgress>>;
  delete(bookId: string): Promise<void>;
}

export type ReadingSessionInput = Omit<ReadingSession, 'id'> & { id?: string };

export interface ReadingSessionRepo {
  add(input: ReadingSessionInput): Promise<ReadingSession>;
  listByBook(bookId: string): Promise<ReadingSession[]>;
  listInRange(from: Date, to: Date): Promise<ReadingSession[]>;
  deleteByBook(bookId: string): Promise<void>;
}

export interface TimelineRepo {
  create(entry: TimelineEntry): Promise<void>;
  get(id: string): Promise<TimelineEntry | null>;
  /** All entries for a book. Caller does sort/filter. */
  listByBook(bookId: string, limit?: number): Promise<TimelineEntry[]>;
  listByChapter(chapterId: string): Promise<TimelineEntry[]>;
  /** Substring search across originalText / userInput / aiResponse. */
  search(bookId: string, query: string): Promise<TimelineEntry[]>;
  delete(id: string): Promise<void>;
}

export interface ConfigRepo {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ModelServiceRepo {
  create(s: ModelService): Promise<void>;
  get(id: string): Promise<ModelService | null>;
  list(): Promise<ModelService[]>;
  update(id: string, patch: Partial<ModelService>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface CostRepo {
  add(record: CostRecord): Promise<void>;
  listInRange(from: Date, to: Date): Promise<CostRecord[]>;
  /** Sum of `amountUSD` over `[from, to)`. */
  totalInRange(from: Date, to: Date): Promise<number>;
  totalForTaskType(from: Date, to: Date, type: TaskType): Promise<number>;
}
