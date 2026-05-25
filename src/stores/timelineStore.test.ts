import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineEntry, TaskType } from '@/types/domain';

const timelineServiceMocks = vi.hoisted(() => ({
  listForBook: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/services/TimelineService', () => ({
  TimelineService: vi.fn(() => timelineServiceMocks),
}));

vi.mock('@/adapters/storage/IndexedDBTimelineRepo', () => ({
  IndexedDBTimelineRepo: vi.fn(() => ({})),
}));

import { _resetTimelineStoreForTests, useTimelineStore } from './timelineStore';

const mk = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: 't1',
  bookId: 'b1',
  chapterId: 'c1',
  timestamp: new Date('2026-01-01T00:00:00Z'),
  type: 'translate' as TaskType,
  originalText: 'M2',
  aiModel: 'claude-sonnet-4-6',
  aiResponse: 'Broad money',
  costTokens: { input: 10, output: 5 },
  costAmount: 0.001,
  persona: 'general',
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('timelineStore', () => {
  beforeEach(() => {
    timelineServiceMocks.listForBook.mockReset();
    timelineServiceMocks.search.mockReset();
    _resetTimelineStoreForTests();
  });

  it('normalizes blank queries to the unsearched timeline path', async () => {
    timelineServiceMocks.listForBook.mockResolvedValue([mk({ id: 'listed' })]);

    useTimelineStore.getState().setQuery('   ');
    await useTimelineStore.getState().reload('b1');

    expect(useTimelineStore.getState().query).toBe('');
    expect(timelineServiceMocks.listForBook).toHaveBeenCalledWith('b1', {});
    expect(timelineServiceMocks.search).not.toHaveBeenCalled();
    expect(useTimelineStore.getState().entries.map(entry => entry.id)).toEqual(['listed']);
  });

  it('treats non-string runtime queries as blank queries', async () => {
    timelineServiceMocks.listForBook.mockResolvedValue([mk({ id: 'listed' })]);
    type SetQueryInput = Parameters<ReturnType<typeof useTimelineStore.getState>['setQuery']>[0];

    useTimelineStore.getState().setQuery(42 as unknown as SetQueryInput);
    await useTimelineStore.getState().reload('b1');

    expect(useTimelineStore.getState().query).toBe('');
    expect(timelineServiceMocks.listForBook).toHaveBeenCalledWith('b1', {});
    expect(timelineServiceMocks.search).not.toHaveBeenCalled();
    expect(useTimelineStore.getState().entries.map(entry => entry.id)).toEqual(['listed']);
  });

  it('trims search queries before reloading', async () => {
    timelineServiceMocks.search.mockResolvedValue([mk({ id: 'matched' })]);

    useTimelineStore.getState().setQuery('  money  ');
    await useTimelineStore.getState().reload('b1');

    expect(useTimelineStore.getState().query).toBe('money');
    expect(timelineServiceMocks.search).toHaveBeenCalledWith('b1', 'money', {});
    expect(timelineServiceMocks.listForBook).not.toHaveBeenCalled();
    expect(useTimelineStore.getState().entries.map(entry => entry.id)).toEqual(['matched']);
  });

  it('does not let a slower earlier reload overwrite a newer reload', async () => {
    const earlier = deferred<TimelineEntry[]>();
    const later = deferred<TimelineEntry[]>();
    timelineServiceMocks.listForBook
      .mockReturnValueOnce(earlier.promise)
      .mockReturnValueOnce(later.promise);

    const earlierReload = useTimelineStore.getState().reload('b1');
    const laterReload = useTimelineStore.getState().reload('b1');

    later.resolve([mk({ id: 'newer' })]);
    await laterReload;

    expect(useTimelineStore.getState().entries.map(entry => entry.id)).toEqual(['newer']);

    earlier.resolve([mk({ id: 'older' })]);
    await earlierReload;

    expect(useTimelineStore.getState().entries.map(entry => entry.id)).toEqual(['newer']);
  });

  it('does not let an in-flight reload repopulate entries after clear', async () => {
    const pending = deferred<TimelineEntry[]>();
    timelineServiceMocks.listForBook.mockReturnValueOnce(pending.promise);
    useTimelineStore.setState({ entries: [mk({ id: 'existing' })] });

    const reload = useTimelineStore.getState().reload('b1');
    useTimelineStore.getState().clear();

    expect(useTimelineStore.getState().entries).toEqual([]);

    pending.resolve([mk({ id: 'stale' })]);
    await reload;

    expect(useTimelineStore.getState().entries).toEqual([]);
  });
});
