import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { IndexedDBAnnotationRepo } from '@/adapters/storage/IndexedDBAnnotationRepo';
import { ExportService, sanitizeExportFilename } from './ExportService';
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
  let annotations: IndexedDBAnnotationRepo;

  beforeEach(async () => {
    await resetDb();
    books = new IndexedDBBookRepo();
    chapters = new IndexedDBChapterRepo();
    timeline = new IndexedDBTimelineRepo();
    annotations = new IndexedDBAnnotationRepo();
    svc = new ExportService(books, chapters, timeline, annotations);
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
    expect(md).toMatch(/^---\ndocument_type: reading_export/m);
    expect(md).toContain('app: aether-reader-flow');
    expect(md).toContain('title: "示例书名"');
    expect(md).toContain('source_file: "sample.pdf"');
    expect(md).toContain('tags:\n  - aether-reader-flow\n  - reading-export');
    expect(md).toContain('# 示例书名');
    expect(md).toContain('## 1. 第一章');
    expect(md).toContain('### [解释]');
    expect(md).toContain('> M2');
    expect(md).toContain('什么是 M2？');
    expect(md).toContain('广义货币供应量');
    expect(md).toContain('claude-sonnet-4-6');
  });

  it('includes selection page and anchor metadata for Obsidian handoff', async () => {
    const book = await books.create({
      title: 'Anchored',
      fileName: 'anchored.pdf',
      totalPages: 20,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C', startPage: 3, endPage: 8, content: '', wordCount: 0 },
    ]);
    await timeline.create(
      mkEntry({
        bookId: book.id,
        chapterId: 'c1',
        page: 5,
        anchor: { start: 12, end: 28, quote: 'anchored quote', page: 5 },
      }),
    );

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('*第 5 页 · 位置：12-28*');
  });

  it('falls back when persisted entry cost metadata is missing', async () => {
    const book = await books.create({
      title: 'Legacy',
      fileName: 'legacy.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create({
      ...mkEntry({ bookId: book.id, chapterId: 'c1', aiResponse: '旧数据也应该可导出。' }),
      costTokens: undefined,
      costAmount: Number.NaN,
    } as unknown as TimelineEntry);

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('旧数据也应该可导出。');
    expect(md).toContain('*claude-sonnet-4-6 · tokens unavailable · cost unavailable*');
  });

  it('escapes quotes and newlines in Markdown frontmatter', async () => {
    const book = await books.create({
      title: 'A "Quoted"\nBook',
      author: 'Author "Name"',
      fileName: 'quoted.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'mixed',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('title: "A \\"Quoted\\" Book"');
    expect(md).toContain('author: "Author \\"Name\\""');
    expect(md).toContain('language: mixed');
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

  it('renders annotations even when a chapter has no timeline entries', async () => {
    const book = await books.create({
      title: 'Marked',
      fileName: 'm.pdf',
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
        content: 'alpha beta',
        wordCount: 2,
      },
    ]);
    await annotations.create({
      id: 'a1',
      bookId: book.id,
      chapterId: 'c1',
      type: 'note',
      color: 'question',
      note: '这里要继续查。',
      anchor: { start: 6, end: 10, quote: 'beta' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('### 批注与高亮');
    expect(md).toContain('[笔记 · 疑问]');
    expect(md).toContain('> beta');
    expect(md).toContain('这里要继续查。');
    expect(md).toContain('位置：6-10');
  });

  it('supports a verification-only export template', async () => {
    const book = await books.create({
      title: 'Template',
      fileName: 'template.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(mkEntry({ id: 'explain-1', bookId: book.id, chapterId: 'c1', aiResponse: '解释结果' }));
    await timeline.create(mkEntry({
      id: 'verify-1',
      bookId: book.id,
      chapterId: 'c1',
      type: 'verify',
      aiResponse: '验证结果',
      sources: [{ url: 'https://example.com/verify', title: 'Verify source', snippet: '...' }],
      confidence: 'high',
    }));
    await annotations.create({
      id: 'a1',
      bookId: book.id,
      chapterId: 'c1',
      type: 'note',
      color: 'important',
      note: '批注内容',
      anchor: { start: 0, end: 2, quote: '批注' },
    });

    const md = await svc.toMarkdown(book.id, { template: 'verification-only' });
    expect(md).toContain('[验证]');
    expect(md).toContain('验证结果');
    expect(md).toContain('Verify source');
    expect(md).not.toContain('解释结果');
    expect(md).not.toContain('批注与高亮');
    expect(md).not.toContain('批注内容');
  });

  it('supports an annotations-only export template', async () => {
    const book = await books.create({
      title: 'Notes',
      fileName: 'notes.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(mkEntry({ id: 'verify-1', bookId: book.id, chapterId: 'c1', type: 'verify', aiResponse: '验证结果' }));
    await annotations.create({
      id: 'a1',
      bookId: book.id,
      chapterId: 'c1',
      type: 'highlight',
      color: 'insight',
      note: '只看批注',
      anchor: { start: 0, end: 4, quote: 'highlighted' },
    });

    const md = await svc.toMarkdown(book.id, { template: 'annotations-only' });
    expect(md).toContain('### 批注与高亮');
    expect(md).toContain('[高亮 · 精彩]');
    expect(md).toContain('> highlighted');
    expect(md).toContain('只看批注');
    expect(md).not.toContain('[验证]');
    expect(md).not.toContain('验证结果');
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

  it('renders only safe verify source URLs as Markdown links', async () => {
    const book = await books.create({
      title: 'Safe Sources',
      fileName: 'safe.pdf',
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
          { url: 'https://example.com/ok?x=1', title: 'Safe [source]', snippet: '...' },
          { url: 'mailto:editor@example.com', title: '', snippet: '...' },
          { url: 'javascript:alert(1)', title: '[Injected](https://evil.test)', snippet: '...' },
          { url: 'data:text/html,<script>alert(1)</script>', title: 'Data source', snippet: '...' },
          { url: '   ', title: '', snippet: '...' },
          { url: 'not a url', title: 'Bad URL', snippet: '...' },
        ],
      }),
    );

    const md = await svc.toMarkdown(book.id);
    expect(md).toContain('[Safe \\[source\\]](<https://example.com/ok?x=1>)');
    expect(md).toContain('[mailto:editor@example.com](<mailto:editor@example.com>)');
    expect(md).toContain('\\[Injected\\]\\(https://evil.test\\)');
    expect(md).toContain('Data source');
    expect(md).toContain('来源 5');
    expect(md).toContain('Bad URL');
    expect(md).not.toContain('](javascript:alert(1))');
    expect(md).not.toContain('](data:text/html');
    expect(md).not.toContain('[Injected](https://evil.test)');
    expect(md).not.toContain('](not a url)');
  });
});

describe('ExportService.toHTML', () => {
  let svc: ExportService;
  let books: IndexedDBBookRepo;
  let chapters: IndexedDBChapterRepo;
  let timeline: IndexedDBTimelineRepo;
  let annotations: IndexedDBAnnotationRepo;

  beforeEach(async () => {
    await resetDb();
    books = new IndexedDBBookRepo();
    chapters = new IndexedDBChapterRepo();
    timeline = new IndexedDBTimelineRepo();
    annotations = new IndexedDBAnnotationRepo();
    svc = new ExportService(books, chapters, timeline, annotations);
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

  it('falls back when persisted entry cost metadata is missing in HTML output', async () => {
    const book = await books.create({
      title: 'Legacy HTML',
      fileName: 'legacy-html.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create({
      ...mkEntry({ bookId: book.id, chapterId: 'c1', aiResponse: 'HTML 旧数据也应该可导出。' }),
      costTokens: undefined,
      costAmount: Number.NaN,
    } as unknown as TimelineEntry);

    const html = await svc.toHTML(book.id);
    expect(html).toContain('HTML 旧数据也应该可导出。');
    expect(html).toContain('claude-sonnet-4-6 · tokens unavailable · cost unavailable');
  });

  it('escapes annotation quotes and notes in HTML output', async () => {
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
    await annotations.create({
      id: 'a1',
      bookId: book.id,
      chapterId: 'c1',
      type: 'highlight',
      color: 'important',
      note: '<b>note</b>',
      anchor: { start: 0, end: 3, quote: '<tag>' },
    });

    const html = await svc.toHTML(book.id);
    expect(html).toContain('批注与高亮');
    expect(html).toContain('&lt;tag&gt;');
    expect(html).toContain('&lt;b&gt;note&lt;/b&gt;');
    expect(html).not.toContain('<b>note</b>');
  });

  it('applies export templates to HTML output', async () => {
    const book = await books.create({
      title: 'HTML Template',
      fileName: 'html-template.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(mkEntry({ id: 'explain-1', bookId: book.id, chapterId: 'c1', aiResponse: 'HTML 解释' }));
    await timeline.create(mkEntry({ id: 'verify-1', bookId: book.id, chapterId: 'c1', type: 'verify', aiResponse: 'HTML 验证' }));
    await annotations.create({
      id: 'a1',
      bookId: book.id,
      chapterId: 'c1',
      type: 'note',
      color: 'todo',
      note: 'HTML 批注',
      anchor: { start: 0, end: 2, quote: 'HTML quote' },
    });

    const html = await svc.toHTML(book.id, { template: 'verification-only' });
    expect(html).toContain('HTML 验证');
    expect(html).not.toContain('HTML 解释');
    expect(html).not.toContain('HTML 批注');
  });

  it('renders only safe verify source URLs as HTML anchors', async () => {
    const book = await books.create({
      title: 'HTML Sources',
      fileName: 'html-sources.pdf',
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
        type: 'verify',
        sources: [
          { url: 'https://example.com/ok', title: '<Safe>', snippet: '...' },
          { url: 'mailto:editor@example.com', title: '', snippet: '...' },
          { url: 'javascript:alert(1)', title: '<Bad script>', snippet: '...' },
          { url: 'data:text/html,<script>alert(1)</script>', title: 'Data URL', snippet: '...' },
          { url: '   ', title: '', snippet: '...' },
          { url: 'not a url', title: 'Bad URL', snippet: '...' },
        ],
      }),
    );

    const html = await svc.toHTML(book.id);
    expect(html).toContain('<a href="https://example.com/ok" target="_blank" rel="noopener">&lt;Safe&gt;</a>');
    expect(html).toContain('<a href="mailto:editor@example.com" target="_blank" rel="noopener">mailto:editor@example.com</a>');
    expect(html).toContain('&lt;Bad script&gt;');
    expect(html).toContain('Data URL');
    expect(html).toContain('来源');
    expect(html).toContain('Bad URL');
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).not.toContain('href="data:text/html');
    expect(html).not.toContain('href="not a url"');
  });
});

describe('ExportService.toZip', () => {
  let svc: ExportService;
  let books: IndexedDBBookRepo;
  let chapters: IndexedDBChapterRepo;
  let timeline: IndexedDBTimelineRepo;
  let annotations: IndexedDBAnnotationRepo;

  beforeEach(async () => {
    await resetDb();
    books = new IndexedDBBookRepo();
    chapters = new IndexedDBChapterRepo();
    timeline = new IndexedDBTimelineRepo();
    annotations = new IndexedDBAnnotationRepo();
    svc = new ExportService(books, chapters, timeline, annotations);
  });

  it('exports multiple books as a Markdown zip with unique filenames', async () => {
    const bookA = await books.create({
      title: '同名书',
      fileName: 'a.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    const bookB = await books.create({
      title: '同名书',
      fileName: 'b.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'a-c1', bookId: bookA.id, orderIndex: 1, title: 'A', startPage: 1, endPage: 1, content: '', wordCount: 0 },
      { id: 'b-c1', bookId: bookB.id, orderIndex: 1, title: 'B', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);
    await timeline.create(mkEntry({ bookId: bookA.id, chapterId: 'a-c1', aiResponse: 'A answer' }));
    await timeline.create(mkEntry({ bookId: bookB.id, chapterId: 'b-c1', aiResponse: 'B answer' }));

    const blob = await svc.toZip([bookA.id, bookB.id], { format: 'markdown' });
    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files).sort()).toEqual(['同名书.md', '同名书_2.md']);
    expect(await zip.file('同名书.md')!.async('string')).toContain('A answer');
    expect(await zip.file('同名书_2.md')!.async('string')).toContain('B answer');
  });

  it('exports HTML zip files', async () => {
    const book = await books.create({
      title: '<HTML Book>',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);

    const blob = await svc.toZip([book.id], { format: 'html' });
    const zip = await JSZip.loadAsync(blob);
    const fileName = Object.keys(zip.files)[0];
    const html = await zip.file(fileName)!.async('string');

    expect(fileName).toBe('HTML_Book.html');
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('&lt;HTML Book&gt;');
  });

  it('rejects empty book lists', async () => {
    await expect(svc.toZip([], { format: 'markdown' })).rejects.toThrow(/no books/i);
  });

  it('deduplicates repeated book ids', async () => {
    const book = await books.create({
      title: 'Only Once',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await chapters.bulkCreate([
      { id: 'c1', bookId: book.id, orderIndex: 1, title: 'C1', startPage: 1, endPage: 1, content: '', wordCount: 0 },
    ]);

    const blob = await svc.toZip([book.id, book.id], { format: 'markdown' });
    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files)).toEqual(['Only_Once.md']);
  });
});

describe('sanitizeExportFilename', () => {
  it('cleans unsafe names and trims long names', () => {
    expect(sanitizeExportFilename('  A/B:C*D?  ')).toBe('A_B_C_D');
    expect(sanitizeExportFilename('x'.repeat(120))).toHaveLength(80);
  });

  it('falls back for blank, illegal-only, and Windows reserved names', () => {
    expect(sanitizeExportFilename('   ')).toBe('export');
    expect(sanitizeExportFilename('///')).toBe('export');
    expect(sanitizeExportFilename('CON')).toBe('export');
    expect(sanitizeExportFilename('lpt1')).toBe('export');
  });
});
