import Dexie from 'dexie';
import { getDb } from './db';
import type { ReadingSessionInput, ReadingSessionRepo } from './interfaces';
import type { ReadingSession } from '@/types/domain';

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export class IndexedDBReadingSessionRepo implements ReadingSessionRepo {
  async add(input: ReadingSessionInput): Promise<ReadingSession> {
    const durationMs = Number.isFinite(input.durationMs)
      ? Math.max(0, input.durationMs)
      : 0;
    const session: ReadingSession = {
      ...input,
      id: input.id ?? `rs-${crypto.randomUUID()}`,
      durationMs,
    };
    await getDb().readingSessions.put(session);
    return session;
  }

  async listByBook(bookId: string): Promise<ReadingSession[]> {
    return await getDb()
      .readingSessions
      .where('[bookId+startedAt]')
      .between([bookId, Dexie.minKey], [bookId, Dexie.maxKey])
      .toArray();
  }

  async listInRange(from: Date, to: Date): Promise<ReadingSession[]> {
    if (!isValidDate(from) || !isValidDate(to)) return [];
    if (from.getTime() >= to.getTime()) return [];

    return await getDb()
      .readingSessions
      .where('startedAt')
      .between(from, to, true, false)
      .toArray();
  }

  async deleteByBook(bookId: string): Promise<void> {
    await getDb().readingSessions.where('bookId').equals(bookId).delete();
  }
}
