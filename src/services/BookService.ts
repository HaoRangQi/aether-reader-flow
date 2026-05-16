/**
 * @fileoverview BookService — orchestrates upload + parse + chapter split.
 *
 * This is the only place that ties together:
 *   - DocumentParser (which produces raw text + outline)
 *   - chapter-detect (which produces chapter records)
 *   - BookRepo / ChapterRepo (which persist)
 *
 * Constructor takes injected adapters so tests can substitute fakes. Real
 * callers (the UploadDialog UI) build a service with `IndexedDB*` + `PdfParser`.
 */
import type { DocumentParser } from '@/adapters/parsers/types';
import type { BookRepo, ChapterRepo } from '@/adapters/storage/interfaces';
import type { Book, Language } from '@/types/domain';
import { detectChapters } from '@/lib/chapter-detect';

/** Hard upload size cap. Above this we reject without parsing. */
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Rough language detection from the first few pages. Conservative: when
 * both scripts are well-represented we return `'mixed'`, which causes
 * prompts to instruct the AI to auto-detect.
 */
function detectLanguage(samples: string[]): Language {
  const sample = samples.slice(0, 5).join('').slice(0, 2000);
  const cjk = (sample.match(/[一-鿿]/g) ?? []).length;
  const en = (sample.match(/[a-zA-Z]/g) ?? []).length;
  if (cjk > en * 2) return 'zh';
  if (en > cjk * 2) return 'en';
  return 'mixed';
}

function stripExt(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

export class BookService {
  constructor(
    private parser: DocumentParser,
    private books: BookRepo,
    private chapters: ChapterRepo,
  ) {}

  /**
   * Upload a PDF blob. Steps:
   *   1. Validate file type and size
   *   2. Parse with the injected `DocumentParser`
   *   3. Detect chapters (outline-aware with single-chapter fallback)
   *   4. Persist Book + Chapters in two writes (no transaction across
   *      stores — Dexie multi-table transactions are heavier than warranted)
   *
   * The original PDF Blob is stored on the Book record so that:
   *   - Future re-renders can read it
   *   - HTML/PDF exports in P3+ can embed source pages if needed
   */
  async upload(file: Blob, fileName: string): Promise<Book> {
    if (file.type && !file.type.includes('pdf')) {
      throw new Error('Only PDF files are supported in MVP.');
    }
    if (file.size > MAX_BYTES) {
      throw new Error(
        `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit (got ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
      );
    }

    const parsed = await this.parser.parse(file);
    // Assign the book id up front so chapter foreign keys can use it.
    const bookId = `book-${crypto.randomUUID()}`;
    const detected = detectChapters(parsed, bookId);
    const language = detectLanguage(parsed.pageTexts);

    const book = await this.books.create({
      id: bookId,
      title: parsed.metadata.title ?? stripExt(fileName),
      author: parsed.metadata.author,
      fileName,
      totalPages: parsed.totalPages,
      totalChapters: detected.chapters.length,
      language,
      fileBlob: file,
    });
    await this.chapters.bulkCreate(detected.chapters);
    return book;
  }
}
