import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from './db';
import { IndexedDBTimelineRepo } from './IndexedDBTimelineRepo';
import type { TimelineEntry, TaskType } from '@/types/domain';

const mk = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: `t-${Math.random()}`,
  bookId: 'b1',
  chapterId: 'c1',
  timestamp: new Date(),
  type: 'translate' as TaskType,
  originalText: 'M2 增速',
  aiModel: 'claude-sonnet-4-6',
  aiResponse: 'Broad money supply',
  costTokens: { input: 100, output: 50 },
  costAmount: 0.001,
  persona: 'general',
  ...overrides,
});

describe('IndexedDBTimelineRepo', () => {
  let repo: IndexedDBTimelineRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBTimelineRepo();
  });

  it('creates and retrieves by id', async () => {
    const e = mk({ id: 't1' });
    await repo.create(e);
    expect((await repo.get('t1'))?.originalText).toBe('M2 增速');
  });

  it('listByBook returns only entries for that book', async () => {
    await repo.create(mk({ id: 't1', bookId: 'b1' }));
    await repo.create(mk({ id: 't2', bookId: 'b1' }));
    await repo.create(mk({ id: 't3', bookId: 'b2' }));
    expect((await repo.listByBook('b1')).length).toBe(2);
    expect((await repo.listByBook('b2')).length).toBe(1);
  });

  it('listByBook respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create(mk({ id: `t${i}` }));
    }
    expect((await repo.listByBook('b1', 2)).length).toBe(2);
  });

  it('listByChapter filters by chapter', async () => {
    await repo.create(mk({ id: 't1', chapterId: 'c1' }));
    await repo.create(mk({ id: 't2', chapterId: 'c2' }));
    expect((await repo.listByChapter('c1')).length).toBe(1);
  });

  it('search matches originalText case-insensitively', async () => {
    await repo.create(mk({ id: 't1', originalText: 'M2 增速' }));
    await repo.create(mk({ id: 't2', originalText: 'PPI' }));
    expect((await repo.search('b1', 'm2')).map(e => e.id)).toEqual(['t1']);
  });

  it('search matches aiResponse and userInput', async () => {
    await repo.create(mk({ id: 't1', aiResponse: '广义货币' }));
    await repo.create(mk({ id: 't2', userInput: '这里指什么?' }));
    expect((await repo.search('b1', '货币')).map(e => e.id)).toEqual(['t1']);
    expect((await repo.search('b1', '什么')).map(e => e.id)).toEqual(['t2']);
  });

  it('deletes a timeline entry', async () => {
    await repo.create(mk({ id: 't1' }));
    await repo.delete('t1');
    expect(await repo.get('t1')).toBeNull();
  });
});
