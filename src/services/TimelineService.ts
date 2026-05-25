/**
 * @fileoverview TimelineService — higher-level queries over TimelineRepo.
 *
 * P2 has AIService writing TimelineEntry directly via the repo. This
 * service wraps the repo for the consumer side (TimelinePanel, Export):
 *   - listForBook(bookId, filter): reverse-chronological + filtering
 *   - search(bookId, query): substring search across user/AI fields
 *
 * Lives in `services/` because it's domain logic (sorting, filtering),
 * not raw storage. The repo stays a thin CRUD adapter.
 */
import type { TimelineRepo } from '@/adapters/storage/interfaces';
import type { TimelineEntry, TaskType } from '@/types/domain';

export interface TimelineFilter {
  chapterId?: string;
  types?: TaskType[];
}

export class TimelineService {
  constructor(private repo: TimelineRepo) {}

  /**
   * Reverse-chronological list with optional chapter/type filters.
   * The repo doesn't preserve insertion order; we sort by timestamp here.
   */
  async listForBook(bookId: string, filter: TimelineFilter = {}): Promise<TimelineEntry[]> {
    const all = await this.repo.listByBook(bookId);
    const sorted = [...all].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const chapterId = filter.chapterId?.trim();
    return sorted.filter(e => {
      if (chapterId && e.chapterId !== chapterId) return false;
      if (filter.types && filter.types.length > 0 && !filter.types.includes(e.type)) return false;
      return true;
    });
  }

  /**
   * Case-insensitive substring search. Applied AFTER fetching everything
   * for the book; adequate for the few-hundred-entries-per-book scale.
   */
  async search(
    bookId: string,
    query: string,
    filter: TimelineFilter = {},
  ): Promise<TimelineEntry[]> {
    const q = query.trim().toLowerCase();
    const all = await this.listForBook(bookId, filter);
    if (!q) return all;
    return all.filter(
      e =>
        e.originalText.toLowerCase().includes(q) ||
        e.aiResponse.toLowerCase().includes(q) ||
        (e.userInput?.toLowerCase().includes(q) ?? false),
    );
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
