import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBBookRepo } from './IndexedDBBookRepo';
import { getDb, resetDb } from './db';

describe('IndexedDBBookRepo', () => {
  let repo: IndexedDBBookRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBBookRepo();
  });

  it('creates a book with auto-generated id and timestamp', async () => {
    const b = await repo.create({
      title: 'Sample Book',
      fileName: 'sample.pdf',
      totalPages: 200,
      totalChapters: 12,
      language: 'zh',
    });
    expect(b.id).toMatch(/^book-/);
    expect(b.uploadedAt).toBeInstanceOf(Date);
    expect(b.title).toBe('Sample Book');
  });

  it('respects a caller-supplied id', async () => {
    const b = await repo.create({
      id: 'fixed-id',
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    expect(b.id).toBe('fixed-id');
  });

  it('lists books reverse-chronologically', async () => {
    await repo.create({
      title: 'A',
      fileName: 'a.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await new Promise(r => setTimeout(r, 5));
    await repo.create({
      title: 'B',
      fileName: 'b.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    const list = await repo.list();
    expect(list.map(b => b.title)).toEqual(['B', 'A']);
  });

  it('lists books stably when uploadedAt is invalid', async () => {
    const db = getDb();
    await db.books.bulkPut([
      {
        id: 'invalid-b',
        title: 'Invalid B',
        fileName: 'invalid-b.pdf',
        totalPages: 1,
        totalChapters: 1,
        language: 'zh',
        uploadedAt: new Date('not-a-date'),
      },
      {
        id: 'valid-old',
        title: 'Valid Old',
        fileName: 'valid-old.pdf',
        totalPages: 1,
        totalChapters: 1,
        language: 'zh',
        uploadedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'invalid-a',
        title: 'Invalid A',
        fileName: 'invalid-a.pdf',
        totalPages: 1,
        totalChapters: 1,
        language: 'zh',
        uploadedAt: new Date('not-a-date'),
      },
      {
        id: 'valid-new',
        title: 'Valid New',
        fileName: 'valid-new.pdf',
        totalPages: 1,
        totalChapters: 1,
        language: 'zh',
        uploadedAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);

    const list = await repo.list();

    expect(list.map(b => b.id)).toEqual(['valid-new', 'valid-old', 'invalid-a', 'invalid-b']);
  });

  it('get returns null for unknown id', async () => {
    expect(await repo.get('does-not-exist')).toBeNull();
  });

  it('updates a book by id', async () => {
    const b = await repo.create({
      title: 'Orig',
      fileName: 'o.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await repo.update(b.id, { title: 'Renamed' });
    expect((await repo.get(b.id))?.title).toBe('Renamed');
  });

  it('archives and restores a book without deleting it', async () => {
    const b = await repo.create({
      title: 'Archive Me',
      fileName: 'a.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });

    await repo.archive(b.id);
    const archived = await repo.get(b.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);

    await repo.restore(b.id);
    expect((await repo.get(b.id))?.archivedAt).toBeUndefined();
  });

  it('archives without deleting related local reading records', async () => {
    const b = await repo.create({
      id: 'b1',
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    const db = getDb();
    await db.chapters.put({
      id: 'c1',
      bookId: b.id,
      orderIndex: 1,
      title: 'Chapter 1',
      startPage: 1,
      endPage: 1,
      content: 'alpha',
      wordCount: 1,
    });
    await db.timeline.put({
      id: 't1',
      bookId: b.id,
      chapterId: 'c1',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      type: 'translate',
      originalText: 'alpha',
      aiModel: 'model',
      aiResponse: 'answer',
      costTokens: { input: 1, output: 1 },
      costAmount: 0.001,
      persona: 'general',
    });
    await db.annotations.put({
      id: 'a1',
      bookId: b.id,
      chapterId: 'c1',
      type: 'highlight',
      color: 'important',
      anchor: { start: 0, end: 5, quote: 'alpha' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.readingProgress.put({
      bookId: b.id,
      chapterId: 'c1',
      chapterOrderIndex: 1,
      chapterTitle: 'Chapter 1',
      totalChapters: 1,
      chapterProgress: 0.5,
      overallProgress: 0.5,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await repo.archive(b.id);

    expect(await db.books.get(b.id)).toBeDefined();
    expect(await db.chapters.where('bookId').equals(b.id).count()).toBe(1);
    expect(await db.timeline.where('bookId').equals(b.id).count()).toBe(1);
    expect(await db.annotations.where('bookId').equals(b.id).count()).toBe(1);
    expect(await db.readingProgress.get(b.id)).toBeDefined();
  });

  it('deletes a book', async () => {
    const b = await repo.create({
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await repo.delete(b.id);
    expect(await repo.get(b.id)).toBeNull();
  });

  it('deletes related local reading records with the book', async () => {
    const b = await repo.create({
      id: 'b1',
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    const db = getDb();
    await db.chapters.put({
      id: 'c1',
      bookId: b.id,
      orderIndex: 1,
      title: 'Chapter 1',
      startPage: 1,
      endPage: 1,
      content: 'alpha',
      wordCount: 1,
    });
    await db.pages.put({ id: 'p1', chapterId: 'c1', pageNumber: 1, text: 'alpha' });
    await db.timeline.put({
      id: 't1',
      bookId: b.id,
      chapterId: 'c1',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      type: 'translate',
      originalText: 'alpha',
      aiModel: 'model',
      aiResponse: 'answer',
      costTokens: { input: 1, output: 1 },
      costAmount: 0.001,
      persona: 'general',
    });
    await db.annotations.put({
      id: 'a1',
      bookId: b.id,
      chapterId: 'c1',
      type: 'highlight',
      color: 'important',
      anchor: { start: 0, end: 5, quote: 'alpha' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.readingProgress.put({
      bookId: b.id,
      chapterId: 'c1',
      chapterOrderIndex: 1,
      chapterTitle: 'Chapter 1',
      totalChapters: 1,
      chapterProgress: 0.5,
      overallProgress: 0.5,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.readingSessions.put({
      id: 'rs1',
      bookId: b.id,
      chapterId: 'c1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:10:00Z'),
      durationMs: 600_000,
    });

    await repo.delete(b.id);

    expect(await db.books.get(b.id)).toBeUndefined();
    expect(await db.chapters.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.pages.where('chapterId').equals('c1').count()).toBe(0);
    expect(await db.timeline.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.annotations.where('bookId').equals(b.id).count()).toBe(0);
    expect(await db.readingProgress.get(b.id)).toBeUndefined();
    expect(await db.readingSessions.where('bookId').equals(b.id).count()).toBe(0);
  });

  it('delete is idempotent', async () => {
    await expect(repo.delete('never-existed')).resolves.toBeUndefined();
  });
});
