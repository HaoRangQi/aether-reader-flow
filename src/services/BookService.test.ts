import { describe, it, expect, beforeEach } from 'vitest';
import { BookService, detectFormat } from './BookService';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import type { DocumentParser, ParsedDocument } from '@/adapters/parsers/types';

/** Stub parser returning a fixed `ParsedDocument`. */
class StubParser implements DocumentParser {
  constructor(private result: ParsedDocument) {}
  async parse(): Promise<ParsedDocument> {
    return this.result;
  }
}

const mkResult = (overrides: Partial<ParsedDocument> = {}): ParsedDocument => ({
  totalPages: 4,
  pageTexts: ['一', '二', '三', '四'],
  outline: [
    { title: 'A', pageNumber: 1 },
    { title: 'B', pageNumber: 3 },
  ],
  metadata: { title: '示例书名', author: '某' },
  ...overrides,
});

/** Build a BookService with the same stub parser registered for both formats. */
function svcWith(parser: DocumentParser) {
  return new BookService(
    { pdf: parser, epub: parser },
    new IndexedDBBookRepo(),
    new IndexedDBChapterRepo(),
  );
}

describe('BookService.upload', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates book + chapters when PDF has outline', async () => {
    const svc = svcWith(new StubParser(mkResult()));
    const blob = new Blob(['x'], { type: 'application/pdf' });
    const book = await svc.upload(blob, 'sample.pdf');

    expect(book.title).toBe('示例书名');
    expect(book.author).toBe('某');
    expect(book.totalChapters).toBe(2);
    expect(book.totalPages).toBe(4);

    const chapters = await new IndexedDBChapterRepo().listByBook(book.id);
    expect(chapters.map(c => c.title)).toEqual(['A', 'B']);
  });

  it('uses filename (without extension) when metadata title missing', async () => {
    const svc = svcWith(new StubParser(mkResult({ metadata: {} })));
    const book = await svc.upload(
      new Blob(['x'], { type: 'application/pdf' }),
      'unknown.pdf',
    );
    expect(book.title).toBe('unknown');
  });

  it('falls back to single chapter when no outline', async () => {
    const svc = svcWith(new StubParser(mkResult({ outline: [] })));
    const book = await svc.upload(
      new Blob(['x'], { type: 'application/pdf' }),
      'x.pdf',
    );
    expect(book.totalChapters).toBe(1);
    const chapters = await new IndexedDBChapterRepo().listByBook(book.id);
    expect(chapters[0].title).toBe('全文');
  });

  it('accepts EPUB by MIME', async () => {
    const svc = svcWith(new StubParser(mkResult()));
    const blob = new Blob(['x'], { type: 'application/epub+zip' });
    const book = await svc.upload(blob, 'sample.epub');
    expect(book.title).toBe('示例书名');
  });

  it('accepts EPUB by extension when MIME missing', async () => {
    const svc = svcWith(new StubParser(mkResult()));
    const blob = new Blob(['x']); // empty type
    const book = await svc.upload(blob, 'sample.epub');
    expect(book.title).toBe('示例书名');
  });

  it('rejects unsupported formats', async () => {
    const svc = svcWith(new StubParser(mkResult()));
    await expect(
      svc.upload(new Blob(['x'], { type: 'text/plain' }), 'a.txt'),
    ).rejects.toThrow(/PDF.*EPUB|EPUB.*PDF/i);
  });

  it('detects Chinese language from CJK-heavy content', async () => {
    const svc = svcWith(
      new StubParser(mkResult({ pageTexts: ['这是中文金融书的内容'.repeat(10)] })),
    );
    const book = await svc.upload(
      new Blob(['x'], { type: 'application/pdf' }),
      'cn.pdf',
    );
    expect(book.language).toBe('zh');
  });

  it('detects English language from Latin-heavy content', async () => {
    const svc = svcWith(
      new StubParser(
        mkResult({
          pageTexts: [
            'Lorem ipsum dolor sit amet consectetur adipiscing elit'.repeat(5),
          ],
        }),
      ),
    );
    const book = await svc.upload(
      new Blob(['x'], { type: 'application/pdf' }),
      'en.pdf',
    );
    expect(book.language).toBe('en');
  });

  it('stores the original Blob on the book record', async () => {
    const svc = svcWith(new StubParser(mkResult()));
    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    const book = await svc.upload(blob, 'x.pdf');
    expect(book.fileBlob).toBeInstanceOf(Blob);
  });
});

describe('detectFormat', () => {
  it('recognizes pdf by mime', () => {
    expect(detectFormat(new Blob([], { type: 'application/pdf' }), 'x')).toBe('pdf');
  });
  it('recognizes epub by mime', () => {
    expect(detectFormat(new Blob([], { type: 'application/epub+zip' }), 'x')).toBe('epub');
  });
  it('recognizes pdf by extension when mime missing', () => {
    expect(detectFormat(new Blob([]), 'book.pdf')).toBe('pdf');
  });
  it('recognizes epub by extension when mime missing', () => {
    expect(detectFormat(new Blob([]), 'book.EPUB')).toBe('epub');
  });
  it('returns null for unknown formats', () => {
    expect(detectFormat(new Blob([]), 'thing.txt')).toBeNull();
  });
});
