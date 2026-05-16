import { describe, it, expect } from 'vitest';
import { detectChapters } from './chapter-detect';
import type { ParsedDocument } from '@/adapters/parsers/types';

const mkDoc = (
  pages: string[],
  outline: { title: string; pageNumber: number }[] = [],
): ParsedDocument => ({
  totalPages: pages.length,
  pageTexts: pages,
  outline,
  metadata: {},
});

describe('detectChapters', () => {
  it('uses outline to split chapters; ranges contiguous and inclusive', () => {
    const doc = mkDoc(
      ['p1', 'p2', 'p3', 'p4', 'p5'],
      [
        { title: 'Ch A', pageNumber: 1 },
        { title: 'Ch B', pageNumber: 4 },
      ],
    );
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('outline');
    expect(out.chapters.map(c => c.title)).toEqual(['Ch A', 'Ch B']);
    expect(out.chapters[0].startPage).toBe(1);
    expect(out.chapters[0].endPage).toBe(3);
    expect(out.chapters[1].startPage).toBe(4);
    expect(out.chapters[1].endPage).toBe(5);
    expect(out.chapters[0].content).toBe('p1\np2\np3');
    expect(out.chapters[1].content).toBe('p4\np5');
  });

  it('orderIndex is 1-based and sequential', () => {
    const doc = mkDoc(
      ['p1', 'p2', 'p3'],
      [
        { title: 'A', pageNumber: 1 },
        { title: 'B', pageNumber: 2 },
        { title: 'C', pageNumber: 3 },
      ],
    );
    const out = detectChapters(doc, 'book1');
    expect(out.chapters.map(c => c.orderIndex)).toEqual([1, 2, 3]);
  });

  it('sorts unordered outline entries by page', () => {
    const doc = mkDoc(
      ['p1', 'p2', 'p3'],
      [
        { title: 'B', pageNumber: 3 },
        { title: 'A', pageNumber: 1 },
      ],
    );
    const out = detectChapters(doc, 'book1');
    expect(out.chapters.map(c => c.title)).toEqual(['A', 'B']);
  });

  it('falls back to single-chapter mode when no outline', () => {
    const doc = mkDoc(['a', 'b']);
    const out = detectChapters(doc, 'book1');
    expect(out.mode).toBe('single');
    expect(out.chapters).toHaveLength(1);
    expect(out.chapters[0].title).toBe('全文');
    expect(out.chapters[0].startPage).toBe(1);
    expect(out.chapters[0].endPage).toBe(2);
    expect(out.chapters[0].content).toBe('a\nb');
  });

  it('counts CJK chars + English words separately', () => {
    const doc = mkDoc(
      ['hello world 你好世界'],
      [{ title: 'A', pageNumber: 1 }],
    );
    const out = detectChapters(doc, 'book1');
    // 2 EN words + 4 CJK chars
    expect(out.chapters[0].wordCount).toBe(6);
  });

  it('chapter id namespaced under bookId', () => {
    const doc = mkDoc(['p1'], [{ title: 'A', pageNumber: 1 }]);
    const out = detectChapters(doc, 'book42');
    expect(out.chapters[0].id).toBe('ch-book42-1');
  });
});
