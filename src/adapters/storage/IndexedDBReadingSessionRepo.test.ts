import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './db';
import { IndexedDBReadingSessionRepo } from './IndexedDBReadingSessionRepo';

describe('IndexedDBReadingSessionRepo', () => {
  let repo: IndexedDBReadingSessionRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBReadingSessionRepo();
  });

  it('adds a reading session with generated id', async () => {
    const session = await repo.add({
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:05:00Z'),
      durationMs: 300_000,
    });

    expect(session.id).toMatch(/^rs-/);
    expect(session.durationMs).toBe(300_000);
  });

  it('normalizes non-finite duration to zero', async () => {
    const session = await repo.add({
      id: 'invalid-duration',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:05:00Z'),
      durationMs: Number.NaN,
    });

    expect(session.durationMs).toBe(0);
    expect((await repo.listByBook('b1'))[0].durationMs).toBe(0);
  });

  it('lists sessions by book in start-time order', async () => {
    await repo.add({
      id: 's2',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-02T00:00:00Z'),
      endedAt: new Date('2026-01-02T00:10:00Z'),
      durationMs: 600_000,
    });
    await repo.add({
      id: 's1',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:10:00Z'),
      durationMs: 600_000,
    });
    await repo.add({
      id: 'other',
      bookId: 'b2',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:10:00Z'),
      durationMs: 600_000,
    });

    expect((await repo.listByBook('b1')).map(session => session.id)).toEqual(['s1', 's2']);
  });

  it('lists sessions by start time range with exclusive upper bound', async () => {
    await repo.add({
      id: 'before',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2025-12-31T23:59:00Z'),
      endedAt: new Date('2026-01-01T00:01:00Z'),
      durationMs: 120_000,
    });
    await repo.add({
      id: 'inside',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T12:00:00Z'),
      endedAt: new Date('2026-01-01T12:05:00Z'),
      durationMs: 300_000,
    });
    await repo.add({
      id: 'upper',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-02T00:00:00Z'),
      endedAt: new Date('2026-01-02T00:05:00Z'),
      durationMs: 300_000,
    });

    const rows = await repo.listInRange(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(rows.map(session => session.id)).toEqual(['inside']);
  });

  it('returns no sessions for an empty or reversed time range', async () => {
    await repo.add({
      id: 'inside',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T12:00:00Z'),
      endedAt: new Date('2026-01-01T12:05:00Z'),
      durationMs: 300_000,
    });

    await expect(repo.listInRange(
      new Date('2026-01-02T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    )).resolves.toEqual([]);
    await expect(repo.listInRange(
      new Date('2026-01-03T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    )).resolves.toEqual([]);
  });

  it('returns no sessions for invalid time range bounds', async () => {
    await repo.add({
      id: 'inside',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T12:00:00Z'),
      endedAt: new Date('2026-01-01T12:05:00Z'),
      durationMs: 300_000,
    });

    await expect(repo.listInRange(
      new Date('not-a-date'),
      new Date('2026-01-02T00:00:00Z'),
    )).resolves.toEqual([]);
    await expect(repo.listInRange(
      new Date('2026-01-01T00:00:00Z'),
      new Date('not-a-date'),
    )).resolves.toEqual([]);
  });

  it('deletes sessions by book idempotently', async () => {
    await repo.add({
      id: 's1',
      bookId: 'b1',
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:10:00Z'),
      durationMs: 600_000,
    });

    await repo.deleteByBook('b1');
    await repo.deleteByBook('b1');

    expect(await repo.listByBook('b1')).toEqual([]);
  });
});
