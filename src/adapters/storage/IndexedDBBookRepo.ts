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
    return await getDb().books.orderBy('uploadedAt').reverse().toArray();
  }

  async update(id: string, patch: Partial<Book>): Promise<void> {
    await getDb().books.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await getDb().books.delete(id);
  }
}
