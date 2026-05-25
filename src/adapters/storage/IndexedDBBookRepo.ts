/**
 * IndexedDB-backed BookRepo. Wraps the Dexie singleton in `./db.ts`.
 *
 * Why a class and not a module of functions? Future SQLite/SyncAdapter
 * implementations need to hold state (connection, sync queue). Keeping
 * BookRepo a class matches the rest of the storage layer.
 */
import { getDb } from './db';
import type { BookRepo, BookInput } from './interfaces';
import type { Book } from '@/types/domain';

function compareUploadedAtDesc(a: Book, b: Book): number {
  const aTime = a.uploadedAt.getTime();
  const bTime = b.uploadedAt.getTime();
  const aFinite = Number.isFinite(aTime);
  const bFinite = Number.isFinite(bTime);
  if (aFinite && bFinite) return bTime - aTime;
  if (aFinite) return -1;
  if (bFinite) return 1;
  return a.id.localeCompare(b.id);
}

export class IndexedDBBookRepo implements BookRepo {
  async create(input: BookInput): Promise<Book> {
    const book: Book = {
      ...input,
      id: input.id ?? `book-${crypto.randomUUID()}`,
      uploadedAt: new Date(),
    };
    await getDb().books.put(book);
    return book;
  }

  async get(id: string): Promise<Book | null> {
    return (await getDb().books.get(id)) ?? null;
  }

  async list(): Promise<Book[]> {
    const books = await getDb().books.toArray();
    return books.sort(compareUploadedAtDesc);
  }

  async update(id: string, patch: Partial<Book>): Promise<void> {
    await getDb().books.update(id, patch);
  }

  async archive(id: string): Promise<void> {
    await this.update(id, { archivedAt: new Date() });
  }

  async restore(id: string): Promise<void> {
    await this.update(id, { archivedAt: undefined });
  }

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.transaction(
      'rw',
      [
        db.books,
        db.chapters,
        db.pages,
        db.timeline,
        db.annotations,
        db.readingProgress,
        db.readingSessions,
      ],
      async () => {
        const chapters = await db.chapters.where('bookId').equals(id).toArray();
        const chapterIds = chapters.map(chapter => chapter.id);
        await Promise.all([
          db.books.delete(id),
          db.readingProgress.delete(id),
          db.readingSessions.where('bookId').equals(id).delete(),
          db.chapters.where('bookId').equals(id).delete(),
          db.timeline.where('bookId').equals(id).delete(),
          db.annotations.where('bookId').equals(id).delete(),
          ...chapterIds.map(chapterId => db.pages.where('chapterId').equals(chapterId).delete()),
        ]);
      },
    );
  }
}
