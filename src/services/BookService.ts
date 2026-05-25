/**
 * @fileoverview BookService — orchestrates upload + parse + chapter split.
 *
 * The service holds a registry of `DocumentParser`s keyed by file extension
 * and/or MIME prefix. On upload it picks the right parser, then:
 *   - parse() → ParsedDocument
 *   - detectChapters() → Chapter[]
 *   - persist book + chapters
 *
 * Adding a new format (web URL, …) means writing one new `DocumentParser`
 * impl and registering it in the parser map at construction. No business
 * code changes.
 */
import type { DocumentParser } from '@/adapters/parsers/types';
import type { BookRepo, ChapterRepo } from '@/adapters/storage/interfaces';
import type { Book, Language } from '@/types/domain';
import { detectChapters } from '@/lib/chapter-detect';

/** Hard upload size cap. Above this we reject without parsing. */
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Supported input formats. Keep this list and `detectFormat()` in sync.
 */
export type SupportedFormat = 'pdf' | 'epub' | 'txt';

export interface ParserRegistry {
  pdf?: DocumentParser;
  epub?: DocumentParser;
  txt?: DocumentParser;
}

/**
 * Rough language detection from the first few pages. Conservative: when
 * both scripts are well-represented we return `'mixed'`.
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

function normalizeMetadataText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeBookTitle(metadataTitle: unknown, fileName: string): string {
  const title = normalizeMetadataText(metadataTitle);
  if (title) return title;

  const fromFile = stripExt(fileName).trim();
  return fromFile || '未命名书籍';
}

/**
 * Detect format from file metadata. MIME type wins when present, falls back
 * to filename extension. Returns `null` if we don't recognize it.
 */
export function detectFormat(file: Blob, fileName: string): SupportedFormat | null {
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('epub')) return 'epub';
  if (mime.startsWith('text/plain')) return 'txt';
  const ext = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (ext === 'txt') return 'txt';
  return null;
}

export class BookService {
  constructor(
    private parsers: ParserRegistry,
    private books: BookRepo,
    private chapters: ChapterRepo,
  ) {}

  /**
   * Upload a book blob. Picks the right parser based on the file's MIME
   * type / extension, parses, splits chapters, and persists.
   */
  async upload(file: Blob, fileName: string): Promise<Book> {
    const format = detectFormat(file, fileName);
    if (!format) {
      throw new Error(
        '只支持 PDF、EPUB 与 TXT 文件。请检查文件后缀或导出格式。',
      );
    }
    const parser = this.parsers[format];
    if (!parser) {
      throw new Error(`未注册 ${format.toUpperCase()} 解析器（程序错误）。`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(
        `文件超出 ${MAX_BYTES / 1024 / 1024} MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)} MB）。`,
      );
    }

    const parsed = await parser.parse(file);
    // Assign the book id up front so chapter foreign keys can use it.
    const bookId = `book-${crypto.randomUUID()}`;
    const detected = detectChapters(parsed, bookId);
    const language = detectLanguage(parsed.pageTexts);

    const book = await this.books.create({
      id: bookId,
      title: normalizeBookTitle(parsed.metadata.title, fileName),
      author: normalizeMetadataText(parsed.metadata.author),
      fileName,
      totalPages: parsed.totalPages,
      totalChapters: detected.chapters.length,
      language,
      fileBlob: file,
    });
    try {
      await this.chapters.bulkCreate(detected.chapters);
    } catch (error) {
      await this.books.delete(book.id);
      throw error;
    }
    return book;
  }
}
