import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDb } from './db';

describe('Dexie schema', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('opens with the 10 expected tables', async () => {
    const db = getDb();
    await db.open();
    const names = db.tables.map(t => t.name).sort();
    expect(names).toEqual([
      'annotations',
      'books',
      'chapters',
      'configs',
      'costRecords',
      'modelServices',
      'pages',
      'readingProgress',
      'readingSessions',
      'timeline',
    ]);
  });

  it('persists and retrieves a book', async () => {
    const db = getDb();
    await db.books.put({
      id: 'b1',
      title: '示例书名',
      fileName: 'sample.pdf',
      totalPages: 10,
      totalChapters: 2,
      uploadedAt: new Date(),
      language: 'zh',
    });
    const book = await db.books.get('b1');
    expect(book?.title).toBe('示例书名');
  });

  it('indexes archivedAt on books', async () => {
    const db = getDb();
    await db.open();
    expect(db.books.schema.indexes.map(index => index.name)).toContain('archivedAt');
  });

  it('uses the [bookId+orderIndex] compound index for chapters', async () => {
    const db = getDb();
    await db.chapters.bulkPut([
      { id: 'c2', bookId: 'b1', orderIndex: 2, title: 'B', startPage: 5, endPage: 10, content: '', wordCount: 0 },
      { id: 'c1', bookId: 'b1', orderIndex: 1, title: 'A', startPage: 1, endPage: 4, content: '', wordCount: 0 },
    ]);
    const list = await db.chapters
      .where('[bookId+orderIndex]')
      .between(['b1', 0], ['b1', 99])
      .toArray();
    expect(list.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('resetDb() wipes data', async () => {
    const db = getDb();
    await db.configs.put({ key: 'k', value: 'v' });
    await resetDb();
    const db2 = getDb();
    expect(await db2.configs.get('k')).toBeUndefined();
  });
});
