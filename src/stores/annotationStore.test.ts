import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBAnnotationRepo } from '@/adapters/storage/IndexedDBAnnotationRepo';
import { resetDb } from '@/adapters/storage/db';
import type { Annotation } from '@/types/domain';
import { _resetAnnotationStoreForTests, useAnnotationStore } from './annotationStore';

const mk = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: 'a1',
  bookId: 'b1',
  chapterId: 'c1',
  type: 'highlight',
  color: 'important',
  anchor: { start: 1, end: 5, quote: 'alpha' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('annotationStore', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb();
    _resetAnnotationStoreForTests();
  });

  it('keeps chapter and book annotation caches in sync', async () => {
    const created = await useAnnotationStore.getState().create({
      bookId: 'b1',
      chapterId: 'c1',
      type: 'highlight',
      color: 'important',
      anchor: { start: 1, end: 5, quote: 'alpha' },
    });

    expect(useAnnotationStore.getState().byChapter.c1).toHaveLength(1);
    expect(useAnnotationStore.getState().byBook.b1).toHaveLength(1);

    await useAnnotationStore.getState().update(
      created.id,
      { type: 'note', note: 'remember this', color: 'question' },
      { chapterId: 'c1', bookId: 'b1' },
    );

    expect(useAnnotationStore.getState().byChapter.c1[0]).toMatchObject({
      type: 'note',
      note: 'remember this',
      color: 'question',
    });
    expect(useAnnotationStore.getState().byBook.b1[0]).toMatchObject({
      type: 'note',
      note: 'remember this',
      color: 'question',
    });

    await useAnnotationStore.getState().delete(created.id, 'c1');

    expect(useAnnotationStore.getState().byChapter.c1).toEqual([]);
    expect(useAnnotationStore.getState().byBook.b1).toEqual([]);
  });

  it('refreshes book caches on update when the caller only provides chapter context', async () => {
    const created = await useAnnotationStore.getState().create({
      bookId: 'b1',
      chapterId: 'c1',
      type: 'highlight',
      color: 'important',
      anchor: { start: 1, end: 5, quote: 'alpha' },
    });

    await useAnnotationStore.getState().update(
      created.id,
      { type: 'note', note: 'derived book refresh', color: 'question' },
      { chapterId: 'c1' },
    );

    expect(useAnnotationStore.getState().byChapter.c1[0]).toMatchObject({
      type: 'note',
      note: 'derived book refresh',
      color: 'question',
    });
    expect(useAnnotationStore.getState().byBook.b1[0]).toMatchObject({
      type: 'note',
      note: 'derived book refresh',
      color: 'question',
    });
  });

  it('does not let a slower earlier chapter load overwrite a newer chapter load', async () => {
    const earlier = deferred<Annotation[]>();
    const later = deferred<Annotation[]>();
    vi.spyOn(IndexedDBAnnotationRepo.prototype, 'listByChapter')
      .mockReturnValueOnce(earlier.promise)
      .mockReturnValueOnce(later.promise);

    const earlierLoad = useAnnotationStore.getState().loadChapter('c1');
    const laterLoad = useAnnotationStore.getState().loadChapter('c1');

    later.resolve([mk({ id: 'newer' })]);
    await laterLoad;

    expect(useAnnotationStore.getState().byChapter.c1.map(annotation => annotation.id)).toEqual([
      'newer',
    ]);

    earlier.resolve([mk({ id: 'older' })]);
    await earlierLoad;

    expect(useAnnotationStore.getState().byChapter.c1.map(annotation => annotation.id)).toEqual([
      'newer',
    ]);
  });

  it('does not let a slower earlier book load overwrite a newer book load', async () => {
    const earlier = deferred<Annotation[]>();
    const later = deferred<Annotation[]>();
    vi.spyOn(IndexedDBAnnotationRepo.prototype, 'listByBook')
      .mockReturnValueOnce(earlier.promise)
      .mockReturnValueOnce(later.promise);

    const earlierLoad = useAnnotationStore.getState().loadBook('b1');
    const laterLoad = useAnnotationStore.getState().loadBook('b1');

    later.resolve([mk({ id: 'newer' })]);
    await laterLoad;

    expect(useAnnotationStore.getState().byBook.b1.map(annotation => annotation.id)).toEqual([
      'newer',
    ]);

    earlier.resolve([mk({ id: 'older' })]);
    await earlierLoad;

    expect(useAnnotationStore.getState().byBook.b1.map(annotation => annotation.id)).toEqual([
      'newer',
    ]);
  });

  it('refreshes stale chapter and book caches when deleting an annotation already missing from storage', async () => {
    vi.spyOn(IndexedDBAnnotationRepo.prototype, 'get').mockResolvedValue(null);
    const deleteAnnotation = vi
      .spyOn(IndexedDBAnnotationRepo.prototype, 'delete')
      .mockResolvedValue(undefined);
    vi.spyOn(IndexedDBAnnotationRepo.prototype, 'listByChapter').mockResolvedValue([]);
    const listByBook = vi
      .spyOn(IndexedDBAnnotationRepo.prototype, 'listByBook')
      .mockResolvedValue([]);

    const staleAnnotation = mk({ id: 'stale' });
    useAnnotationStore.setState({
      byChapter: { c1: [staleAnnotation] },
      byBook: { b1: [staleAnnotation] },
    });

    await useAnnotationStore.getState().delete('stale', 'c1');

    expect(deleteAnnotation).toHaveBeenCalledWith('stale');
    expect(listByBook).toHaveBeenCalledWith('b1');
    expect(useAnnotationStore.getState().byChapter.c1).toEqual([]);
    expect(useAnnotationStore.getState().byBook.b1).toEqual([]);
  });
});
