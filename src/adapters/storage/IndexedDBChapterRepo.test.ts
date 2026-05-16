import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBChapterRepo } from './IndexedDBChapterRepo';
import { resetDb } from './db';
import type { Chapter } from '@/types/domain';

const mk = (i: number, bookId = 'b1'): Chapter => ({
  id: `ch${bookId}-${i}`,
  bookId,
  orderIndex: i,
  title: `第${i}章`,
  startPage: i * 10,
  endPage: i * 10 + 9,
  content: 'x'.repeat(100),
  wordCount: 100,
});

describe('IndexedDBChapterRepo', () => {
  let repo: IndexedDBChapterRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBChapterRepo();
  });

  it('bulkCreate then listByBook returns chapters in order', async () => {
    // Insert out of order — listByBook must still return ordered.
    await repo.bulkCreate([mk(3), mk(1), mk(2)]);
    const list = await repo.listByBook('b1');
    expect(list.map(c => c.orderIndex)).toEqual([1, 2, 3]);
  });

  it('isolates chapters per book', async () => {
    await repo.bulkCreate([mk(1, 'b1'), mk(2, 'b1'), mk(1, 'b2')]);
    expect((await repo.listByBook('b1'))).toHaveLength(2);
    expect((await repo.listByBook('b2'))).toHaveLength(1);
  });

  it('listByBook returns empty array for unknown bookId', async () => {
    expect(await repo.listByBook('never')).toEqual([]);
  });

  it('updates a chapter partial', async () => {
    await repo.bulkCreate([mk(1)]);
    await repo.update('chb1-1', { title: 'Renamed' });
    expect((await repo.get('chb1-1'))?.title).toBe('Renamed');
  });

  it('deletes a chapter', async () => {
    await repo.bulkCreate([mk(1)]);
    await repo.delete('chb1-1');
    expect(await repo.get('chb1-1')).toBeNull();
  });
});
