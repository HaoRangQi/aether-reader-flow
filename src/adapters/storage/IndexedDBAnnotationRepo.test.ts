import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './db';
import { IndexedDBAnnotationRepo } from './IndexedDBAnnotationRepo';
import type { AnnotationInput } from './interfaces';

const mk = (overrides: Partial<AnnotationInput> = {}): AnnotationInput => ({
  bookId: 'b1',
  chapterId: 'c1',
  type: 'highlight',
  color: 'important',
  anchor: { start: 10, end: 15, quote: 'alpha' },
  ...overrides,
});

describe('IndexedDBAnnotationRepo', () => {
  let repo: IndexedDBAnnotationRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBAnnotationRepo();
  });

  it('creates an annotation with generated metadata', async () => {
    const ann = await repo.create(mk({ id: 'a1' }));
    expect(ann.id).toBe('a1');
    expect(ann.createdAt).toBeInstanceOf(Date);
    expect(ann.updatedAt).toBeInstanceOf(Date);
    expect((await repo.get('a1'))?.anchor.quote).toBe('alpha');
  });

  it('lists annotations by book in reverse creation order', async () => {
    await repo.create(mk({ id: 'a1', createdAt: new Date('2026-01-01T00:00:00Z') }));
    await repo.create(mk({ id: 'a2', createdAt: new Date('2026-01-02T00:00:00Z') }));
    await repo.create(mk({ id: 'a3', bookId: 'b2' }));

    expect((await repo.listByBook('b1')).map(a => a.id)).toEqual(['a2', 'a1']);
  });

  it('lists annotations by book after invalid creation dates', async () => {
    await repo.create(mk({ id: 'invalid-b', createdAt: new Date(Number.NaN) }));
    await repo.create(mk({ id: 'valid-old', createdAt: new Date('2026-01-01T00:00:00Z') }));
    await repo.create(mk({ id: 'valid-new', createdAt: new Date('2026-01-02T00:00:00Z') }));
    await repo.create(mk({ id: 'invalid-a', createdAt: new Date(Number.NaN) }));

    expect((await repo.listByBook('b1')).map(a => a.id)).toEqual([
      'valid-new',
      'valid-old',
      'invalid-a',
      'invalid-b',
    ]);
  });

  it('lists annotations by chapter in reading order', async () => {
    await repo.create(mk({ id: 'a1', anchor: { start: 30, end: 35, quote: 'third' } }));
    await repo.create(mk({ id: 'a2', anchor: { start: 5, end: 10, quote: 'first' } }));
    await repo.create(mk({ id: 'a3', chapterId: 'c2' }));

    expect((await repo.listByChapter('c1')).map(a => a.id)).toEqual(['a2', 'a1']);
  });

  it('lists annotations by chapter after non-finite anchors and invalid creation dates', async () => {
    await repo.create(mk({
      id: 'invalid-start',
      anchor: { start: Number.NaN, end: 15, quote: 'unknown' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }));
    await repo.create(mk({
      id: 'invalid-date',
      anchor: { start: 5, end: 10, quote: 'second' },
      createdAt: new Date(Number.NaN),
    }));
    await repo.create(mk({
      id: 'valid-date',
      anchor: { start: 5, end: 10, quote: 'first' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }));
    await repo.create(mk({
      id: 'earlier-start',
      anchor: { start: 2, end: 4, quote: 'earlier' },
      createdAt: new Date(Number.NaN),
    }));

    expect((await repo.listByChapter('c1')).map(a => a.id)).toEqual([
      'earlier-start',
      'valid-date',
      'invalid-date',
      'invalid-start',
    ]);
  });

  it('updates note content and timestamp', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    await repo.create(mk({ id: 'a1', type: 'note', note: 'old', createdAt, updatedAt: createdAt }));

    await repo.update('a1', { note: 'new', color: 'question' });

    const ann = await repo.get('a1');
    expect(ann?.note).toBe('new');
    expect(ann?.color).toBe('question');
    expect(ann!.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it('deletes annotations idempotently', async () => {
    await repo.create(mk({ id: 'a1' }));
    await repo.delete('a1');
    await repo.delete('a1');

    expect(await repo.get('a1')).toBeNull();
  });
});
