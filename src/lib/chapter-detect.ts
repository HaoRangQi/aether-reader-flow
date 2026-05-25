/**
 * @fileoverview Chapter detection from a parsed PDF.
 *
 * Strategy (in order):
 *   1. If the PDF carries an outline (TOC bookmarks), use it as the chapter
 *      boundaries. Each outline entry begins a chapter; the chapter ends at
 *      the page before the next outline entry (or the last page).
 *   2. Otherwise, conservatively scan page-leading heading lines such as
 *      "Chapter 1" or "第 1 章".
 *   3. If that still cannot find at least two chapters, fall back to a single
 *      "全文" chapter containing the entire book.
 *
 * This module is intentionally pure (no IO, no PDF.js). All it needs is the
 * `ParsedDocument` from a parser plus the `bookId` for FK assignment.
 */
import type { ParsedDocument, ParsedOutlineItem } from '@/adapters/parsers/types';
import type { Chapter } from '@/types/domain';

export interface DetectResult {
  mode: 'outline' | 'heuristic' | 'single';
  chapters: Chapter[];
}

interface NormalizedDocument {
  totalPages: number;
  pageTexts: string[];
  outline: ParsedOutlineItem[];
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
  const normalized = normalizeDocument(doc);
  const outline = normalizeOutline(normalized);
  if (outline.length > 0) {
    const chapters: Chapter[] = outline.map((item, i) => {
      const start = item.pageNumber;
      const end =
        i + 1 < outline.length ? outline[i + 1].pageNumber - 1 : normalized.totalPages;
      const content = normalized.pageTexts.slice(start - 1, end).join('\n');
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

  const heuristic = detectHeuristicChapters(normalized, bookId);
  if (heuristic.length >= 2) {
    return { mode: 'heuristic', chapters: heuristic };
  }

  // No outline → single chapter encompassing the whole document.
  const content = normalized.pageTexts.join('\n');
  return {
    mode: 'single',
    chapters: [
      {
        id: `ch-${bookId}-1`,
        bookId,
        orderIndex: 1,
        title: '全文',
        startPage: 1,
        endPage: normalized.totalPages,
        content,
        wordCount: wordCount(content),
      },
    ],
  };
}

function normalizeDocument(doc: ParsedDocument): NormalizedDocument {
  const totalPages = normalizeTotalPages(doc);
  const pageTexts = Array.from(
    { length: totalPages },
    (_, index) => normalizePageText(doc.pageTexts[index]),
  );

  return {
    totalPages,
    pageTexts,
    outline: Array.isArray(doc.outline) ? doc.outline : [],
  };
}

function normalizeTotalPages(doc: ParsedDocument): number {
  if (Number.isFinite(doc.totalPages) && doc.totalPages >= 1) {
    return Math.floor(doc.totalPages);
  }
  return Math.max(1, doc.pageTexts.length);
}

function normalizePageText(text: unknown): string {
  return typeof text === 'string' ? text : '';
}

function normalizeOutline(doc: NormalizedDocument): ParsedOutlineItem[] {
  const seenPages = new Set<number>();
  return doc.outline
    .map(item => ({
      title: item.title.trim(),
      pageNumber: item.pageNumber,
    }))
    .filter(item => (
      item.title.length > 0 &&
      Number.isInteger(item.pageNumber) &&
      item.pageNumber >= 1 &&
      item.pageNumber <= doc.totalPages
    ))
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .filter(item => {
      if (seenPages.has(item.pageNumber)) return false;
      seenPages.add(item.pageNumber);
      return true;
    });
}

function detectHeuristicChapters(doc: NormalizedDocument, bookId: string): Chapter[] {
  const headings = doc.pageTexts
    .map((text, index) => ({
      pageNumber: index + 1,
      title: findPageHeading(text),
    }))
    .filter((item): item is { pageNumber: number; title: string } => Boolean(item.title));

  const uniqueHeadings = headings.filter(
    (item, index) => index === 0 || item.pageNumber !== headings[index - 1].pageNumber,
  );
  if (uniqueHeadings.length < 2) return [];

  return uniqueHeadings.map((item, index) => {
    const start = index === 0 ? 1 : item.pageNumber;
    const end =
      index + 1 < uniqueHeadings.length
        ? uniqueHeadings[index + 1].pageNumber - 1
        : doc.totalPages;
    const content = doc.pageTexts.slice(start - 1, end).join('\n');
    return {
      id: `ch-${bookId}-${index + 1}`,
      bookId,
      orderIndex: index + 1,
      title: item.title,
      startPage: start,
      endPage: end,
      content,
      wordCount: wordCount(content),
    };
  });
}

function findPageHeading(text: string): string | null {
  const candidate = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .find(isLikelyChapterHeading);

  return candidate ?? null;
}

function isLikelyChapterHeading(line: string): boolean {
  if (line.length > 80) return false;
  if (/[。！？；]$/.test(line)) return false;
  return (
    /^chapter\s+\d+(\s*[:：.-]\s*.+|\s+.+)?$/i.test(line) ||
    /^part\s+\d+(\s*[:：.-]\s*.+|\s+.+)?$/i.test(line) ||
    /^第\s*[一二三四五六七八九十百千万\d]+\s*[章节篇部卷]\s*[:：、.-]?\s*\S{0,40}$/.test(line) ||
    /^[一二三四五六七八九十]{1,3}[、.．]\s*\S.{0,40}$/.test(line)
  );
}
