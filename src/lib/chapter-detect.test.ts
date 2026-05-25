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

  it('ignores invalid outline entries and duplicate page starts', () => {
    const doc = mkDoc(
      ['p1', 'p2', 'p3', 'p4'],
      [
        { title: 'Before book', pageNumber: 0 },
        { title: '  A  ', pageNumber: 1 },
        { title: 'Duplicate A', pageNumber: 1 },
        { title: '', pageNumber: 2 },
        { title: 'After book', pageNumber: 99 },
        { title: 'B', pageNumber: 3 },
      ],
    );
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('outline');
    expect(out.chapters.map(c => [c.title, c.startPage, c.endPage, c.content])).toEqual([
      ['A', 1, 2, 'p1\np2'],
      ['B', 3, 4, 'p3\np4'],
    ]);
  });

  it('keeps declared page ranges when extracted page text is shorter than totalPages', () => {
    const doc: ParsedDocument = {
      ...mkDoc(
        ['p1', 'p2'],
        [
          { title: 'A', pageNumber: 1 },
          { title: 'B', pageNumber: 4 },
        ],
      ),
      totalPages: 4,
    };
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('outline');
    expect(out.chapters.map(c => [c.startPage, c.endPage, c.content])).toEqual([
      [1, 3, 'p1\np2\n'],
      [4, 4, ''],
    ]);
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

  it('conservatively detects page-leading headings when no outline exists', () => {
    const doc = mkDoc([
      'Preface\nsome setup',
      'Chapter 1: Money\nchapter one body',
      'more chapter one',
      '第 2 章 通胀\nchapter two body',
      'more chapter two',
    ]);
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('heuristic');
    expect(out.chapters.map(c => c.title)).toEqual(['Chapter 1: Money', '第 2 章 通胀']);
    expect(out.chapters[0].startPage).toBe(1);
    expect(out.chapters[0].endPage).toBe(3);
    expect(out.chapters[1].startPage).toBe(4);
    expect(out.chapters[1].endPage).toBe(5);
  });

  it('does not split on a single heading-like line or body list items', () => {
    const doc = mkDoc([
      'Chapter 1\nOnly one obvious heading',
      '正文\n一、这是正文中的列表项。\n二、这是另一个列表项。',
    ]);
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('single');
    expect(out.chapters).toHaveLength(1);
  });

  it('treats runtime non-string page text as empty text', () => {
    const doc = {
      totalPages: 3,
      pageTexts: [
        'Chapter 1\nchapter one body',
        null,
        'Chapter 2\nchapter two body',
      ],
      outline: [],
      metadata: {},
    } as unknown as ParsedDocument;
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('heuristic');
    expect(out.chapters.map(c => [c.startPage, c.endPage, c.content])).toEqual([
      [1, 2, 'Chapter 1\nchapter one body\n'],
      [3, 3, 'Chapter 2\nchapter two body'],
    ]);
  });

  it('treats malformed runtime outline data as missing outline data', () => {
    const doc = {
      totalPages: 2,
      pageTexts: ['a', 'b'],
      outline: null,
      metadata: {},
    } as unknown as ParsedDocument;
    const out = detectChapters(doc, 'book1');

    expect(out.mode).toBe('single');
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
