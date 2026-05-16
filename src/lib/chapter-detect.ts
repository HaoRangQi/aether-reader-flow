/**
 * @fileoverview Chapter detection from a parsed PDF.
 *
 * Strategy (in order):
 *   1. If the PDF carries an outline (TOC bookmarks), use it as the chapter
 *      boundaries. Each outline entry begins a chapter; the chapter ends at
 *      the page before the next outline entry (or the last page).
 *   2. Otherwise, fall back to a single "全文" chapter containing the entire
 *      book. The Reader UI will still work, just without navigation. P2/P5
 *      can later add heuristic detection (regex on headings) for outline-less
 *      PDFs.
 *
 * This module is intentionally pure (no IO, no PDF.js). All it needs is the
 * `ParsedDocument` from a parser plus the `bookId` for FK assignment.
 */
import type { ParsedDocument } from '@/adapters/parsers/types';
import type { Chapter } from '@/types/domain';

export interface DetectResult {
  mode: 'outline' | 'single';
  chapters: Chapter[];
}

/**
 * Counts CJK characters + Western words. Sufficient for rough cost preview.
 * Not used for any cost calculation — only display.
 */
function wordCount(s: string): number {
  const cjk = (s.match(/[一-鿿]/g) ?? []).length;
  const en = (s.match(/[a-zA-Z]+/g) ?? []).length;
  return cjk + en;
}

export function detectChapters(doc: ParsedDocument, bookId: string): DetectResult {
  if (doc.outline.length > 0) {
    // Sort by page in case the PDF outline came back out of order.
    const sorted = [...doc.outline].sort((a, b) => a.pageNumber - b.pageNumber);
    const chapters: Chapter[] = sorted.map((item, i) => {
      const start = item.pageNumber;
      const end =
        i + 1 < sorted.length ? sorted[i + 1].pageNumber - 1 : doc.totalPages;
      const content = doc.pageTexts.slice(start - 1, end).join('\n');
      return {
        id: `ch-${bookId}-${i + 1}`,
        bookId,
        orderIndex: i + 1,
        title: item.title,
        startPage: start,
        endPage: end,
        content,
        wordCount: wordCount(content),
      };
    });
    return { mode: 'outline', chapters };
  }

  // No outline → single chapter encompassing the whole document.
  const content = doc.pageTexts.join('\n');
  return {
    mode: 'single',
    chapters: [
      {
        id: `ch-${bookId}-1`,
        bookId,
        orderIndex: 1,
        title: '全文',
        startPage: 1,
        endPage: doc.totalPages,
        content,
        wordCount: wordCount(content),
      },
    ],
  };
}
