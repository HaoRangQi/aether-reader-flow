import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './db';
import { IndexedDBReadingProgressRepo } from './IndexedDBReadingProgressRepo';
import type { ReadingProgressInput } from './interfaces';

const mk = (overrides: Partial<ReadingProgressInput> = {}): ReadingProgressInput => ({
  bookId: 'b1',
  chapterId: 'c1',
  chapterOrderIndex: 1,
  chapterTitle: 'Intro',
  totalChapters: 3,
  chapterProgress: 0.25,
  overallProgress: 0.08,
  ...overrides,
});

describe('IndexedDBReadingProgressRepo', () => {
  let repo: IndexedDBReadingProgressRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBReadingProgressRepo();
  });

  it('upserts and retrieves progress by book id', async () => {
    const first = await repo.upsert(mk({ updatedAt: new Date('2026-01-01T00:00:00Z') }));
    expect(first.updatedAt).toBeInstanceOf(Date);

    await repo.upsert(mk({
      chapterId: 'c2',
      chapterOrderIndex: 2,
      chapterTitle: 'Next',
      chapterProgress: 0.5,
      overallProgress: 0.5,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    }));

    expect(await repo.get('b1')).toMatchObject({
      bookId: 'b1',
      chapterId: 'c2',
      chapterTitle: 'Next',
      overallProgress: 0.5,
    });
  });

  it('returns null for missing progress', async () => {
    expect(await repo.get('missing')).toBeNull();
  });

  it('normalizes invalid progress ratios and update timestamps before storing', async () => {
    const before = Date.now();
    const saved = await repo.upsert(mk({
      chapterProgress: Number.NaN,
      overallProgress: Number.POSITIVE_INFINITY,
      updatedAt: new Date(Number.NaN),
    }));
    const after = Date.now();

    expect(saved.chapterProgress).toBe(0);
    expect(saved.overallProgress).toBe(0);
    expect(Number.isFinite(saved.updatedAt.getTime())).toBe(true);
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.updatedAt.getTime()).toBeLessThanOrEqual(after);

    await repo.upsert(mk({
      chapterProgress: -0.5,
      overallProgress: 1.5,
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    }));

    expect(await repo.get('b1')).toMatchObject({
      chapterProgress: 0,
      overallProgress: 1,
    });
  });

  it('lists progress for multiple books keyed by book id', async () => {
    await repo.upsert(mk({ bookId: 'b1' }));
    await repo.upsert(mk({ bookId: 'b2', chapterId: 'c9' }));

    const rows = await repo.listByBooks(['b1', 'b3', 'b2']);

    expect(Object.keys(rows).sort()).toEqual(['b1', 'b2']);
    expect(rows.b2.chapterId).toBe('c9');
  });

  it('deletes progress idempotently', async () => {
    await repo.upsert(mk());
    await repo.delete('b1');
    await repo.delete('b1');

    expect(await repo.get('b1')).toBeNull();
  });
});
