import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { TimelineService } from './TimelineService';
import type { TimelineEntry, TaskType } from '@/types/domain';

const mk = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: `t-${Math.random()}`,
  bookId: 'b1',
  chapterId: 'c1',
  timestamp: new Date(),
  type: 'translate' as TaskType,
  originalText: 'M2',
  aiModel: 'claude-sonnet-4-6',
  aiResponse: 'Broad money',
  costTokens: { input: 10, output: 5 },
  costAmount: 0.001,
  persona: 'general',
  ...overrides,
});

describe('TimelineService', () => {
  let repo: IndexedDBTimelineRepo;
  let svc: TimelineService;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBTimelineRepo();
    svc = new TimelineService(repo);
  });

  it('lists entries reverse-chronologically', async () => {
    await repo.create(mk({ id: 'a', timestamp: new Date(2024, 0, 1) }));
    await repo.create(mk({ id: 'b', timestamp: new Date(2024, 0, 2) }));
    const list = await svc.listForBook('b1');
    expect(list.map(e => e.id)).toEqual(['b', 'a']);
  });

  it('filters by chapter', async () => {
    await repo.create(mk({ id: 'a', chapterId: 'c1' }));
    await repo.create(mk({ id: 'b', chapterId: 'c2' }));
    const list = await svc.listForBook('b1', { chapterId: 'c1' });
    expect(list.map(e => e.id)).toEqual(['a']);
  });

  it('filters by task type', async () => {
    await repo.create(mk({ id: 'a', type: 'translate' }));
    await repo.create(mk({ id: 'b', type: 'verify' }));
    const list = await svc.listForBook('b1', { types: ['verify'] });
    expect(list.map(e => e.id)).toEqual(['b']);
  });

  it('filters by multiple task types (OR)', async () => {
    await repo.create(mk({ id: 'a', type: 'translate' }));
    await repo.create(mk({ id: 'b', type: 'verify' }));
    await repo.create(mk({ id: 'c', type: 'explain' }));
    const list = await svc.listForBook('b1', { types: ['translate', 'verify'] });
    expect(list.length).toBe(2);
  });

  it('empty types[] is treated as no filter', async () => {
    await repo.create(mk({ id: 'a' }));
    await repo.create(mk({ id: 'b', type: 'verify' }));
    expect((await svc.listForBook('b1', { types: [] })).length).toBe(2);
  });

  it('search matches originalText / aiResponse / userInput', async () => {
    await repo.create(mk({ id: 'a', originalText: 'M2 增速', aiResponse: '广义货币' }));
    await repo.create(mk({ id: 'b', originalText: 'PPI', aiResponse: '生产者价格' }));
    await repo.create(mk({ id: 'c', userInput: '为什么这么说', aiResponse: '...' }));
    expect((await svc.search('b1', '货币')).map(e => e.id)).toEqual(['a']);
    expect((await svc.search('b1', '为什么')).map(e => e.id)).toEqual(['c']);
  });

  it('search is case-insensitive', async () => {
    await repo.create(mk({ id: 'a', aiResponse: 'Broad Money Supply' }));
    const r = await svc.search('b1', 'money');
    expect(r.length).toBe(1);
  });

  it('delete', async () => {
    await repo.create(mk({ id: 'a' }));
    await svc.delete('a');
    expect(await repo.get('a')).toBeNull();
  });
});
