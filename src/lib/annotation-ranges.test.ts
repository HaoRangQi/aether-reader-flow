import { describe, expect, it } from 'vitest';
import { buildAnnotationSegments } from './annotation-ranges';
import type { Annotation } from '@/types/domain';

const ann = (id: string, start: number, end: number): Annotation => ({
  id,
  bookId: 'b1',
  chapterId: 'c1',
  type: 'highlight',
  color: 'important',
  anchor: { start, end, quote: 'x' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

describe('annotation ranges', () => {
  it('splits content into plain and annotated segments', () => {
    const segments = buildAnnotationSegments('alpha beta gamma', [
      ann('a1', 6, 10),
    ]);

    expect(segments.map(s => [s.text, s.annotation?.id ?? null])).toEqual([
      ['alpha ', null],
      ['beta', 'a1'],
      [' gamma', null],
    ]);
  });

  it('skips overlapping annotations to keep rendered text stable', () => {
    const segments = buildAnnotationSegments('abcdefghi', [
      ann('a1', 1, 5),
      ann('a2', 3, 8),
      ann('a3', 6, 9),
    ]);

    expect(segments.map(s => [s.text, s.annotation?.id ?? null])).toEqual([
      ['a', null],
      ['bcde', 'a1'],
      ['f', null],
      ['ghi', 'a3'],
    ]);
  });

  it('ignores invalid anchors', () => {
    const segments = buildAnnotationSegments('abc', [
      ann('a1', -5, -1),
      ann('a2', 4, 9),
      ann('a3', 2, 2),
    ]);

    expect(segments).toEqual([{ text: 'abc', start: 0, end: 3 }]);
  });

  it('normalizes reversed anchors before rendering', () => {
    const segments = buildAnnotationSegments('abcdef', [
      ann('a1', 5, 2),
    ]);

    expect(segments.map(s => [s.text, s.start, s.end, s.annotation?.id ?? null])).toEqual([
      ['ab', 0, 2, null],
      ['cde', 2, 5, 'a1'],
      ['f', 5, 6, null],
    ]);
  });

  it('clamps annotations that partially fall outside chapter content', () => {
    const segments = buildAnnotationSegments('abcdef', [
      ann('a1', -3, 2),
      ann('a2', 4, 99),
    ]);

    expect(segments.map(s => [s.text, s.start, s.end, s.annotation?.id ?? null])).toEqual([
      ['ab', 0, 2, 'a1'],
      ['cd', 2, 4, null],
      ['ef', 4, 6, 'a2'],
    ]);
  });

  it('skips empty quotes and non-finite offsets', () => {
    const emptyQuote = { ...ann('a1', 0, 2), anchor: { start: 0, end: 2, quote: '   ' } };
    const nonFiniteStart = { ...ann('a2', 2, 4), anchor: { start: Number.NaN, end: 4, quote: 'x' } };

    const segments = buildAnnotationSegments('abcdef', [
      emptyQuote,
      nonFiniteStart,
      ann('a3', 4, 6),
    ]);

    expect(segments.map(s => [s.text, s.annotation?.id ?? null])).toEqual([
      ['abcd', null],
      ['ef', 'a3'],
    ]);
  });

  it('skips malformed anchors without throwing', () => {
    const missingAnchor = { ...ann('a1', 0, 2), anchor: undefined } as unknown as Annotation;
    const nonStringQuote = {
      ...ann('a2', 2, 4),
      anchor: { start: 2, end: 4, quote: null },
    } as unknown as Annotation;

    const segments = buildAnnotationSegments('abcdef', [
      missingAnchor,
      nonStringQuote,
      ann('a3', 4, 6),
    ]);

    expect(segments.map(s => [s.text, s.annotation?.id ?? null])).toEqual([
      ['abcd', null],
      ['ef', 'a3'],
    ]);
  });

  it('splits long plain segments without changing absolute offsets', () => {
    const segments = buildAnnotationSegments('abcdefghijkl', [], { maxSegmentLength: 5 });

    expect(segments).toEqual([
      { text: 'abcde', start: 0, end: 5 },
      { text: 'fghij', start: 5, end: 10 },
      { text: 'kl', start: 10, end: 12 },
    ]);
  });

  it('normalizes unsafe max segment lengths before splitting', () => {
    expect(
      buildAnnotationSegments('abcdef', [], { maxSegmentLength: Number.NaN }),
    ).toEqual([{ text: 'abcdef', start: 0, end: 6 }]);

    expect(
      buildAnnotationSegments('abcdef', [], { maxSegmentLength: 2.8 }),
    ).toEqual([
      { text: 'ab', start: 0, end: 2 },
      { text: 'cd', start: 2, end: 4 },
      { text: 'ef', start: 4, end: 6 },
    ]);

    expect(
      buildAnnotationSegments('abc', [], { maxSegmentLength: -5 }),
    ).toEqual([
      { text: 'a', start: 0, end: 1 },
      { text: 'b', start: 1, end: 2 },
      { text: 'c', start: 2, end: 3 },
    ]);
  });

  it('prefers natural boundaries when splitting long segments', () => {
    const segments = buildAnnotationSegments('alpha beta\ngamma delta', [], {
      maxSegmentLength: 12,
    });

    expect(segments.map(s => s.text)).toEqual(['alpha beta\n', 'gamma delta']);
    expect(segments.map(s => [s.start, s.end])).toEqual([
      [0, 11],
      [11, 22],
    ]);
  });

  it('does not exceed the max length to include a trailing natural boundary', () => {
    const segments = buildAnnotationSegments('alpha beta gamma', [], {
      maxSegmentLength: 10,
    });

    expect(segments.map(s => s.text)).toEqual(['alpha beta', ' gamma']);
    expect(segments.every(s => s.text.length <= 10)).toBe(true);
  });

  it('preserves annotation identity when splitting long annotated segments', () => {
    const segments = buildAnnotationSegments('0123456789abcdef', [ann('a1', 2, 14)], {
      maxSegmentLength: 5,
    });

    expect(segments.map(s => [s.text, s.start, s.end, s.annotation?.id ?? null])).toEqual([
      ['01', 0, 2, null],
      ['23456', 2, 7, 'a1'],
      ['789ab', 7, 12, 'a1'],
      ['cd', 12, 14, 'a1'],
      ['ef', 14, 16, null],
    ]);
  });
});
