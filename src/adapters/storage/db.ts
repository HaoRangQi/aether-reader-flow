/**
 * @fileoverview Dexie database wrapper and schema.
 *
 * This is the ONLY place in the codebase that touches Dexie directly. All
 * other code goes through Repository interfaces (`./interfaces.ts`). This
 * isolation means a future SQLite/Tauri port can swap implementations
 * without touching business logic.
 *
 * ## Schema versioning
 *
 * Each call to `this.version(N).stores({...})` defines schema version N.
 * Bumping a version REQUIRES:
 *   1. Add a NEW `this.version(N+1).stores({...})` call below the existing one
 *   2. NEVER delete or modify existing `version()` calls — Dexie uses them
 *      to upgrade databases that were created at older versions
 *   3. If columns/tables change in non-additive ways, also call
 *      `.upgrade(trans => { ... })` on the new version block
 *
 * See: https://dexie.org/docs/Tutorial/Design#database-versioning
 *
 * ## Index syntax
 *
 * The string passed to a table is its index spec:
 *   - First field = primary key (e.g. `'id'`)
 *   - Other fields = secondary indexes (e.g. `'title'`)
 *   - `[a+b]` = compound index (e.g. `'[bookId+orderIndex]'`)
 *   - `&field` = unique constraint
 */
import Dexie, { type Table } from 'dexie';
import type {
  Book,
  Chapter,
  Annotation,
  ReadingProgress,
  ReadingSession,
  TimelineEntry,
  ModelService,
  CostRecord,
} from '@/types/domain';

/** A single page's extracted text. Used for re-rendering or re-export. */
export interface PageRecord {
  id: string;
  chapterId: string;
  pageNumber: number;
  text: string;
}

/** Key-value blob for misc settings (theme, font prefs, routing, ...). */
export interface ConfigEntry {
  key: string;
  value: unknown;
}

/**
 * The Dexie subclass that owns all tables and schema.
 *
 * Singleton-accessed via `getDb()` so that test code can call `resetDb()`
 * between cases to start clean. Production code never instantiates this
 * directly.
 */
class AetherDb extends Dexie {
  books!: Table<Book, string>;
  chapters!: Table<Chapter, string>;
  annotations!: Table<Annotation, string>;
  readingProgress!: Table<ReadingProgress, string>;
  readingSessions!: Table<ReadingSession, string>;
  pages!: Table<PageRecord, string>;
  timeline!: Table<TimelineEntry, string>;
  configs!: Table<ConfigEntry, string>;
  modelServices!: Table<ModelService, string>;
  costRecords!: Table<CostRecord, string>;

  constructor() {
    super('aether-reader-flow');
    // ─── Version 1 (MVP baseline) ─────────────────────────────────────────
    // To evolve the schema, add a `.version(2).stores({...})` block below
    // and document the change. NEVER modify this one in-place after release.
    this.version(1).stores({
      books: 'id, title, uploadedAt',
      chapters: 'id, bookId, [bookId+orderIndex]',
      pages: 'id, chapterId, [chapterId+pageNumber]',
      timeline: 'id, bookId, chapterId, timestamp, [bookId+timestamp]',
      configs: 'key',
      modelServices: 'id, name',
      costRecords: 'id, timestamp, [timestamp+model]',
    });
    this.version(2).stores({
      books: 'id, title, uploadedAt',
      chapters: 'id, bookId, [bookId+orderIndex]',
      annotations: 'id, bookId, chapterId, type, createdAt, [bookId+createdAt], [chapterId+createdAt]',
      pages: 'id, chapterId, [chapterId+pageNumber]',
      timeline: 'id, bookId, chapterId, timestamp, [bookId+timestamp]',
      configs: 'key',
      modelServices: 'id, name',
      costRecords: 'id, timestamp, [timestamp+model]',
    });
    this.version(3).stores({
      books: 'id, title, uploadedAt',
      chapters: 'id, bookId, [bookId+orderIndex]',
      annotations: 'id, bookId, chapterId, type, createdAt, [bookId+createdAt], [chapterId+createdAt]',
      readingProgress: 'bookId, updatedAt',
      pages: 'id, chapterId, [chapterId+pageNumber]',
      timeline: 'id, bookId, chapterId, timestamp, [bookId+timestamp]',
      configs: 'key',
      modelServices: 'id, name',
      costRecords: 'id, timestamp, [timestamp+model]',
    });
    this.version(4).stores({
      books: 'id, title, uploadedAt',
      chapters: 'id, bookId, [bookId+orderIndex]',
      annotations: 'id, bookId, chapterId, type, createdAt, [bookId+createdAt], [chapterId+createdAt]',
      readingProgress: 'bookId, updatedAt',
      readingSessions: 'id, bookId, chapterId, startedAt, endedAt, [bookId+startedAt]',
      pages: 'id, chapterId, [chapterId+pageNumber]',
      timeline: 'id, bookId, chapterId, timestamp, [bookId+timestamp]',
      configs: 'key',
      modelServices: 'id, name',
      costRecords: 'id, timestamp, [timestamp+model]',
    });
    this.version(5).stores({
      books: 'id, title, uploadedAt, archivedAt',
      chapters: 'id, bookId, [bookId+orderIndex]',
      annotations: 'id, bookId, chapterId, type, createdAt, [bookId+createdAt], [chapterId+createdAt]',
      readingProgress: 'bookId, updatedAt',
      readingSessions: 'id, bookId, chapterId, startedAt, endedAt, [bookId+startedAt]',
      pages: 'id, chapterId, [chapterId+pageNumber]',
      timeline: 'id, bookId, chapterId, timestamp, [bookId+timestamp]',
      configs: 'key',
      modelServices: 'id, name',
      costRecords: 'id, timestamp, [timestamp+model]',
    });
  }
}

let _db: AetherDb | null = null;

/**
 * Returns the singleton database instance. Lazily constructed so tests can
 * call `resetDb()` to wipe and re-create.
 */
export function getDb(): AetherDb {
  if (!_db) _db = new AetherDb();
  return _db;
}

/**
 * Delete the entire database. Intended for tests; calling in production
 * destroys all user data.
 */
export async function resetDb(): Promise<void> {
  if (_db) {
    await _db.delete();
    _db = null;
  } else {
    // Database may exist from a previous suite/process — open + delete it
    // to ensure a true clean slate.
    const tmp = new AetherDb();
    await tmp.delete();
  }
}
