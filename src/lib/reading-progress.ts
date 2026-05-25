import type { Chapter, ReadingProgress } from '@/types/domain';

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeTotalChapters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function normalizeChapterOrderIndex(value: number, totalChapters: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(totalChapters, Math.floor(value));
}

function normalizeUpdatedAt(value: Date | undefined): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  return new Date();
}

export function calculateOverallProgress(
  chapterOrderIndex: number,
  totalChapters: number,
  chapterProgress: number,
): number {
  const normalizedTotalChapters = normalizeTotalChapters(totalChapters);
  if (normalizedTotalChapters <= 0) return 0;
  const normalizedChapterOrderIndex = normalizeChapterOrderIndex(
    chapterOrderIndex,
    normalizedTotalChapters,
  );
  const completedChapters = normalizedChapterOrderIndex - 1;
  return clampProgress(
    (completedChapters + clampProgress(chapterProgress)) / normalizedTotalChapters,
  );
}

export function buildReadingProgress(input: {
  bookId: string;
  chapter: Chapter;
  totalChapters: number;
  chapterProgress: number;
  updatedAt?: Date;
}): ReadingProgress {
  const chapterProgress = clampProgress(input.chapterProgress);
  const totalChapters = normalizeTotalChapters(input.totalChapters);
  const chapterOrderIndex = totalChapters > 0
    ? normalizeChapterOrderIndex(input.chapter.orderIndex, totalChapters)
    : 0;
  return {
    bookId: input.bookId,
    chapterId: input.chapter.id,
    chapterOrderIndex,
    chapterTitle: input.chapter.title,
    totalChapters,
    chapterProgress,
    overallProgress: calculateOverallProgress(
      chapterOrderIndex,
      totalChapters,
      chapterProgress,
    ),
    updatedAt: normalizeUpdatedAt(input.updatedAt),
  };
}
