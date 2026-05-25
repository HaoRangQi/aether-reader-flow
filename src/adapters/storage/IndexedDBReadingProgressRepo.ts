import { getDb } from './db';
import { clampProgress } from '@/lib/reading-progress';
import type {
  ReadingProgressInput,
  ReadingProgressRepo,
} from './interfaces';
import type { ReadingProgress } from '@/types/domain';

function normalizeUpdatedAt(value: Date | undefined): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  return new Date();
}

export class IndexedDBReadingProgressRepo implements ReadingProgressRepo {
  async upsert(input: ReadingProgressInput): Promise<ReadingProgress> {
    const progress: ReadingProgress = {
      ...input,
      chapterProgress: clampProgress(input.chapterProgress),
      overallProgress: clampProgress(input.overallProgress),
      updatedAt: normalizeUpdatedAt(input.updatedAt),
    };
    await getDb().readingProgress.put(progress);
    return progress;
  }

  async get(bookId: string): Promise<ReadingProgress | null> {
    return (await getDb().readingProgress.get(bookId)) ?? null;
  }

  async listByBooks(bookIds: string[]): Promise<Record<string, ReadingProgress>> {
    if (bookIds.length === 0) return {};
    const rows = await getDb().readingProgress.bulkGet(bookIds);
    return rows.reduce<Record<string, ReadingProgress>>((acc, row) => {
      if (row) acc[row.bookId] = row;
      return acc;
    }, {});
  }

  async delete(bookId: string): Promise<void> {
    await getDb().readingProgress.delete(bookId);
  }
}
