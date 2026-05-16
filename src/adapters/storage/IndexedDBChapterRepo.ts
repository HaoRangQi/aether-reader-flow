/**
 * IndexedDB-backed ChapterRepo. Uses the `[bookId+orderIndex]` compound
 * index to efficiently list ordered chapters per book.
 */
import { getDb } from './db';
import type { ChapterRepo } from './interfaces';
import type { Chapter } from '@/types/domain';

export class IndexedDBChapterRepo implements ChapterRepo {
  async create(c: Chapter): Promise<void> {
    await getDb().chapters.put(c);
  }

  async bulkCreate(chapters: Chapter[]): Promise<void> {
    await getDb().chapters.bulkPut(chapters);
  }

  async get(id: string): Promise<Chapter | null> {
    return (await getDb().chapters.get(id)) ?? null;
  }

  async listByBook(bookId: string): Promise<Chapter[]> {
    // Dexie's compound-index range query is the efficient path here.
    return await getDb()
      .chapters.where('[bookId+orderIndex]')
      .between([bookId, Number.NEGATIVE_INFINITY], [bookId, Number.POSITIVE_INFINITY])
      .toArray();
  }

  async update(id: string, patch: Partial<Chapter>): Promise<void> {
    await getDb().chapters.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await getDb().chapters.delete(id);
  }
}
