/**
 * IndexedDB-backed TimelineRepo.
 *
 * Each AI call writes one TimelineEntry. The full history per book IS the
 * "thinking document". Queries used by P3:
 *   - listByBook(bookId): everything in the book
 *   - listByChapter(chapterId): drill down for "this chapter's discussion"
 *   - search(bookId, query): substring search across original + answer + question
 */
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
    const collection = getDb().timeline.where('bookId').equals(bookId);
    if (limit !== undefined) {
      return await collection.limit(limit).toArray();
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
    const q = query.toLowerCase();
    const all = await this.listByBook(bookId);
    return all.filter(
      e =>
        e.originalText.toLowerCase().includes(q) ||
        e.aiResponse.toLowerCase().includes(q) ||
        (e.userInput?.toLowerCase().includes(q) ?? false),
    );
  }

  async delete(id: string): Promise<void> {
    await getDb().timeline.delete(id);
  }
}
