/**
 * IndexedDB-backed TimelineRepo.
 *
 * Each AI call writes one TimelineEntry. The full history per book IS the
 * "thinking document". Queries used by P3:
 *   - listByBook(bookId): everything in the book
 *   - listByChapter(chapterId): drill down for "this chapter's discussion"
 *   - search(bookId, query): substring search across original + answer + question
 */
import Dexie from 'dexie';
import { getDb } from './db';
import type { TimelineRepo } from './interfaces';
import type { TimelineEntry } from '@/types/domain';

function normalizedSearchText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export class IndexedDBTimelineRepo implements TimelineRepo {
  async create(entry: TimelineEntry): Promise<void> {
    await getDb().timeline.put(entry);
  }

  async get(id: string): Promise<TimelineEntry | null> {
    return (await getDb().timeline.get(id)) ?? null;
  }

  async listByBook(bookId: string, limit?: number): Promise<TimelineEntry[]> {
    const collection = getDb()
      .timeline
      .where('[bookId+timestamp]')
      .between([bookId, Dexie.minKey], [bookId, Dexie.maxKey])
      .reverse();
    if (limit !== undefined) {
      const normalizedLimit = Math.floor(limit);
      if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) return [];
      return await collection.limit(normalizedLimit).toArray();
    }
    return await collection.toArray();
  }

  async listByChapter(chapterId: string): Promise<TimelineEntry[]> {
    return await getDb().timeline.where('chapterId').equals(chapterId).toArray();
  }

  /**
   * Substring search (case-insensitive) across originalText, userInput,
   * and aiResponse. Naive — scans every entry for the book. Adequate
   * because timelines rarely exceed a few thousand entries per book.
   */
  async search(bookId: string, query: string): Promise<TimelineEntry[]> {
    const q = query.trim().toLowerCase();
    const all = await this.listByBook(bookId);
    if (!q) return all;
    return all.filter(
      e =>
        normalizedSearchText(e.originalText).includes(q) ||
        normalizedSearchText(e.aiResponse).includes(q) ||
        normalizedSearchText(e.userInput).includes(q),
    );
  }

  async delete(id: string): Promise<void> {
    await getDb().timeline.delete(id);
  }
}
