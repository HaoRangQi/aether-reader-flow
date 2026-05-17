import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { ExportService } from './ExportService';
import type { TimelineEntry } from '@/types/domain';

const mkEntry = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: `t-${Math.random()}`,
  bookId: 'b1',
  chapterId: 'c1',
  timestamp: new Date('2024-01-01T08:30:00Z'),
  type: 'explain',
  originalText: 'M2',
  userInput: '什么是 M2？',
  aiModel: 'claude-sonnet-4-6',
  aiResponse: '广义货币供应量。',
  costTokens: { input: 100, output: 50 },
  costAmount: 0.002,
  persona: 'general',
  ...overrides,
});

describe('ExportService.toMarkdown', () => {
  let svc: ExportService;
  let books: IndexedDBBookRepo;
  let chapters: IndexedDBChapterRepo;
  let timeline: IndexedDBTimelineRepo;

  beforeEach(async () => {
    await resetDb();
    books = new IndexedDBBookRepo();
    chapters = new IndexedDBChapterRepo();
    timeline = new IndexedDBTimelineRepo();
    svc = new ExportService(books, chapters, timeline);
  });

  it('renders book → chapters → entries hierarchy', async () => {
    const book = await books.create({
      title: '示例书名',
      author: '某',
      fileName: 'sample.pdf',
      totalPages: 10,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      {
        id: 'c1',
        bookId: book.id,
        orderIndex: 1,
        title: '第一章',
        startPage: 1,
        endPage: 10,
        content: '',
        wordCount: 0,
      },
    ]);
    await timeline.create(mkEntry({ bookId: book.id, chapterId: 'c1' }));

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('# 示例书名');
    expect(md).toContain('## 1. 第一章');
    expect(md).toContain('### [解释]');
    expect(md).toContain('> M2');
    expect(md).toContain('什么是 M2？');
    expect(md).toContain('广义货币供应量');
    expect(md).toContain('claude-sonnet-4-6');
  });

  it('throws if book not found', async () => {
    await expect(svc.toMarkdown('does-not-exist')).rejects.toThrow(/not found/i);
  });

  it('emits placeholder when no entries', async () => {
    const book = await books.create({
      title: 'Empty',
      fileName: 'e.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      {
        id: 'c1',
        bookId: book.id,
        orderIndex: 1,
        title: 'C1',
        startPage: 1,
        endPage: 1,
        content: '',
        wordCount: 0,
      },
    ]);
    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('暂无');
  });

  it('respects chapterIds filter', async () => {
    const book = await books.create({
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 2,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'A', startPage: 1, endPage: 5, content: '', wordCount: 0 },
      { id: 'c2', bookId: book.id, orderIndex: 2, title: 'B', startPage: 6, endPage: 10, content: '', wordCount: 0 },
    ]);
    await timeline.create(mkEntry({ id: 't1', bookId: book.id, chapterId: 'c1' }));
    await timeline.create(mkEntry({ id: 't2', bookId: book.id, chapterId: 'c2', aiResponse: 'B response' }));

    const md = await svc.toMarkdown(book.id, { chapterIds: ['c1'] });
    expect(md).toContain('A');
    expect(md).not.toContain('B response');
  });

  it('renders sources list for verify entries', async () => {
    const book = await books.create({
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(
      mkEntry({
        bookId: book.id,
        type: 'verify',
        sources: [
          { url: 'https://example.com/1', title: 'Source 1', snippet: '...' },
        ],
        confidence: 'high',
      }),
    );

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('**来源：**');
    expect(md).toContain('Source 1');
    expect(md).toContain('https://example.com/1');
    expect(md).toContain('置信度');
  });
});

describe('ExportService.toHTML', () => {
  let svc: ExportService;
  let books: IndexedDBBookRepo;
  let chapters: IndexedDBChapterRepo;
  let timeline: IndexedDBTimelineRepo;

  beforeEach(async () => {
    await resetDb();
    books = new IndexedDBBookRepo();
    chapters = new IndexedDBChapterRepo();
    timeline = new IndexedDBTimelineRepo();
    svc = new ExportService(books, chapters, timeline);
  });

  it('produces a self-contained HTML document with inline CSS', async () => {
    const book = await books.create({
      title: 'T',
      fileName: 't.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(
      mkEntry({
        bookId: book.id,
        chapterId: 'c1',
        type: 'translate',
        originalText: 'hedge',
        aiResponse: '对冲',
      }),
    );

    const html = await svc.toHTML(book.id);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<style>');
    expect(html).toContain('hedge');
    expect(html).toContain('对冲');
    expect(html).toContain('<title>T</title>');
  });

  it('escapes HTML special chars in user content (XSS-safe)', async () => {
    const book = await books.create({
      title: '<script>',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(
      mkEntry({
        bookId: book.id,
        chapterId: 'c1',
        type: 'chat',
        originalText: '<img src=x>',
        aiResponse: '<b>bold</b>',
      }),
    );

    const html = await svc.toHTML(book.id);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});
