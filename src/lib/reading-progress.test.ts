import { describe, expect, it } from 'vitest';
import {
  buildReadingProgress,
  calculateOverallProgress,
  clampProgress,
} from './reading-progress';
import type { Chapter } from '@/types/domain';

const chapter: Chapter = {
  id: 'c2',
  bookId: 'b1',
  orderIndex: 2,
  title: 'Middle',
  startPage: 10,
  endPage: 20,
  content: 'content',
  wordCount: 1,
};

describe('reading progress helpers', () => {
  it('clamps invalid progress ratios', () => {
    expect(clampProgress(-0.5)).toBe(0);
    expect(clampProgress(1.5)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(0.4)).toBe(0.4);
  });

  it('rolls chapter progress into whole-book progress', () => {
    expect(calculateOverallProgress(2, 4, 0.5)).toBe(0.375);
    expect(calculateOverallProgress(1, 4, 0)).toBe(0);
    expect(calculateOverallProgress(4, 4, 1)).toBe(1);
    expect(calculateOverallProgress(1, 0, 1)).toBe(0);
  });

  it('normalizes invalid chapter counts and order indexes', () => {
    expect(calculateOverallProgress(-2, 4, 0.5)).toBe(0.125);
    expect(calculateOverallProgress(99, 4, 0.5)).toBe(0.875);
    expect(calculateOverallProgress(2.8, 4.9, 0.5)).toBe(0.375);
    expect(calculateOverallProgress(2, Number.POSITIVE_INFINITY, 1)).toBe(0);
  });

  it('builds a durable progress row from a chapter', () => {
    const updatedAt = new Date('2026-01-01T00:00:00Z');
    const progress = buildReadingProgress({
      bookId: 'b1',
      chapter,
      totalChapters: 4,
      chapterProgress: 0.5,
      updatedAt,
    });

    expect(progress).toMatchObject({
      bookId: 'b1',
      chapterId: 'c2',
      chapterOrderIndex: 2,
      chapterTitle: 'Middle',
      totalChapters: 4,
      chapterProgress: 0.5,
      overallProgress: 0.375,
      updatedAt,
    });
  });

  it('stores normalized progress rows for drifted chapter metadata', () => {
    const progress = buildReadingProgress({
      bookId: 'b1',
      chapter: { ...chapter, orderIndex: 99 },
      totalChapters: 4.9,
      chapterProgress: 2,
    });

    expect(progress).toMatchObject({
      chapterOrderIndex: 4,
      totalChapters: 4,
      chapterProgress: 1,
      overallProgress: 1,
    });
  });

  it('replaces invalid update timestamps with a valid date', () => {
    const before = Date.now();
    const progress = buildReadingProgress({
      bookId: 'b1',
      chapter,
      totalChapters: 4,
      chapterProgress: 0.5,
      updatedAt: new Date(Number.NaN),
    });
    const after = Date.now();

    expect(Number.isFinite(progress.updatedAt.getTime())).toBe(true);
    expect(progress.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(progress.updatedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
