import { describe, expect, it } from 'vitest';
import { buildLibraryStats, buildReadingStats } from './reading-stats';
import type {
  Annotation,
  Book,
  Chapter,
  ReadingProgress,
  ReadingSession,
  TimelineEntry,
} from '@/types/domain';

const chapter = (id: string, orderIndex: number, wordCount: number): Chapter => ({
  id,
  bookId: 'b1',
  orderIndex,
  title: `Chapter ${orderIndex}`,
  startPage: orderIndex,
  endPage: orderIndex,
  content: '',
  wordCount,
});

const progress: ReadingProgress = {
  bookId: 'b1',
  chapterId: 'c2',
  chapterOrderIndex: 2,
  chapterTitle: 'Chapter 2',
  totalChapters: 3,
  chapterProgress: 0.5,
  overallProgress: 0.5,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const book = (id: string, title: string): Book => ({
  id,
  title,
  fileName: `${title}.pdf`,
  totalPages: 100,
  totalChapters: 3,
  uploadedAt: new Date('2026-01-01T00:00:00Z'),
  language: 'mixed',
});

const bookProgress = (
  bookId: string,
  overallProgress: number,
  updatedAt: string,
): ReadingProgress => ({
  bookId,
  chapterId: `${bookId}-c1`,
  chapterOrderIndex: 1,
  chapterTitle: 'Chapter 1',
  totalChapters: 3,
  chapterProgress: 0.5,
  overallProgress,
  updatedAt: new Date(updatedAt),
});

const annotation = (id: string, type: Annotation['type']): Annotation => ({
  id,
  bookId: 'b1',
  chapterId: 'c1',
  type,
  color: 'important',
  anchor: { start: 0, end: 5, quote: 'alpha' },
  note: type === 'note' ? 'note' : undefined,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const entry = (id: string, type: TimelineEntry['type'], input = 100, output = 50): TimelineEntry => ({
  id,
  bookId: 'b1',
  chapterId: 'c1',
  timestamp: new Date('2026-01-01T00:00:00Z'),
  type,
  originalText: 'alpha',
  aiModel: 'model',
  aiResponse: 'answer',
  costTokens: { input, output },
  costAmount: 0.01,
  persona: 'general',
});

const session = (id: string, startedAt: Date, durationMs: number): ReadingSession => ({
  id,
  bookId: 'b1',
  chapterId: 'c1',
  startedAt,
  endedAt: new Date(startedAt.getTime() + durationMs),
  durationMs,
});

describe('reading stats', () => {
  it('builds a book-level reading summary from existing records', () => {
    const stats = buildReadingStats({
      chapters: [
        chapter('c1', 1, 1000),
        chapter('c2', 2, 2000),
        chapter('c3', 3, 3000),
      ],
      progress,
      annotations: [annotation('a1', 'highlight'), annotation('a2', 'note')],
      timelineEntries: [
        entry('t1', 'translate', 100, 50),
        entry('t2', 'chat', 300, 200),
        entry('t3', 'chat', 400, 100),
      ],
      readingSessions: [
        session('s1', new Date(2026, 0, 1, 10), 10 * 60_000),
        session('s2', new Date(2026, 0, 2, 10), 20 * 60_000),
      ],
      dailyGoalMinutes: 30,
      now: new Date(2026, 0, 2, 12),
    });

    expect(stats.progressPercent).toBe(50);
    expect(stats.currentChapterLabel).toBe('2. Chapter 2');
    expect(stats.completedChapters).toBe(1);
    expect(stats.estimatedReadWords).toBe(2000);
    expect(stats.totalWords).toBe(6000);
    expect(stats.annotations).toEqual({ total: 2, highlights: 1, notes: 1 });
    expect(stats.ai.total).toBe(3);
    expect(stats.ai.byType.translate).toBe(1);
    expect(stats.ai.byType.chat).toBe(2);
    expect(stats.ai.inputTokens).toBe(800);
    expect(stats.ai.outputTokens).toBe(350);
    expect(stats.ai.costUSD).toBeCloseTo(0.03);
    expect(stats.readingTime.totalMs).toBe(30 * 60_000);
    expect(stats.readingTime.todayMs).toBe(20 * 60_000);
    expect(stats.readingTime.sessions).toBe(2);
    expect(stats.readingTime.wordsPerMinute).toBe(67);
    expect(stats.readingTime.dailyGoalMinutes).toBe(30);
    expect(stats.readingTime.dailyGoalPercent).toBe(67);
    expect(stats.readingTime.remainingTodayMs).toBe(10 * 60_000);
    expect(stats.readingTime.goalMet).toBe(false);
    expect(stats.readingTime.activeDays).toBe(2);
    expect(stats.readingTime.currentStreakDays).toBe(2);
    expect(stats.readingTime.favoriteHourLabel).toBe('10:00-11:00');
    expect(stats.readingTime.aiInteractionsPerHour).toBe(6);
    expect(stats.readingTime.recentDays).toEqual([
      { date: '2025-12-27', durationMs: 0, sessions: 0, goalMet: false },
      { date: '2025-12-28', durationMs: 0, sessions: 0, goalMet: false },
      { date: '2025-12-29', durationMs: 0, sessions: 0, goalMet: false },
      { date: '2025-12-30', durationMs: 0, sessions: 0, goalMet: false },
      { date: '2025-12-31', durationMs: 0, sessions: 0, goalMet: false },
      { date: '2026-01-01', durationMs: 10 * 60_000, sessions: 1, goalMet: false },
      { date: '2026-01-02', durationMs: 20 * 60_000, sessions: 1, goalMet: false },
    ]);
    expect(stats.readingTime.mostReadChapter).toEqual({
      chapterId: 'c1',
      title: '1. Chapter 1',
      durationMs: 30 * 60_000,
    });
  });

  it('marks daily reading goal as met', () => {
    const stats = buildReadingStats({
      chapters: [chapter('c1', 1, 1000)],
      progress: {
        ...progress,
        chapterId: 'c1',
        chapterOrderIndex: 1,
        overallProgress: 1,
        chapterProgress: 1,
      },
      annotations: [],
      timelineEntries: [],
      readingSessions: [session('s1', new Date(2026, 0, 2, 10), 30 * 60_000)],
      dailyGoalMinutes: 20,
      now: new Date(2026, 0, 2, 12),
    });

    expect(stats.readingTime.dailyGoalPercent).toBe(100);
    expect(stats.readingTime.remainingTodayMs).toBe(0);
    expect(stats.readingTime.goalMet).toBe(true);
  });

  it('splits reading sessions across local day boundaries', () => {
    const stats = buildReadingStats({
      chapters: [chapter('c1', 1, 1000)],
      progress,
      annotations: [],
      timelineEntries: [],
      readingSessions: [
        session('s1', new Date(2026, 0, 1, 23, 50), 20 * 60_000),
      ],
      dailyGoalMinutes: 10,
      now: new Date(2026, 0, 2, 12),
    });

    expect(stats.readingTime.todayMs).toBe(10 * 60_000);
    expect(stats.readingTime.dailyGoalPercent).toBe(100);
    expect(stats.readingTime.goalMet).toBe(true);
    expect(stats.readingTime.activeDays).toBe(2);
    expect(stats.readingTime.currentStreakDays).toBe(2);
    expect(stats.readingTime.recentDays.slice(-2)).toEqual([
      { date: '2026-01-01', durationMs: 10 * 60_000, sessions: 1, goalMet: true },
      { date: '2026-01-02', durationMs: 10 * 60_000, sessions: 1, goalMet: true },
    ]);
  });

  it('ignores corrupted reading sessions while keeping valid history', () => {
    const validSession = session('s1', new Date(2026, 0, 2, 10), 20 * 60_000);
    const missingStartedAt = {
      id: 's2',
      bookId: 'b1',
      chapterId: 'c1',
      endedAt: new Date(2026, 0, 2, 11),
      durationMs: 10 * 60_000,
    } as unknown as ReadingSession;

    const stats = buildReadingStats({
      chapters: [chapter('c1', 1, 1000)],
      progress,
      annotations: [],
      timelineEntries: [],
      readingSessions: [
        validSession,
        missingStartedAt,
        session('s3', new Date(Number.NaN), 10 * 60_000),
        session('s4', new Date(2026, 0, 2, 12), Number.NaN),
        session('s5', new Date(2026, 0, 2, 13), -5 * 60_000),
      ],
      dailyGoalMinutes: 30,
      now: new Date(2026, 0, 2, 14),
    });

    expect(stats.readingTime.totalMs).toBe(20 * 60_000);
    expect(stats.readingTime.todayMs).toBe(20 * 60_000);
    expect(stats.readingTime.sessions).toBe(1);
    expect(stats.readingTime.activeDays).toBe(1);
    expect(stats.readingTime.favoriteHourLabel).toBe('10:00-11:00');
    expect(stats.readingTime.mostReadChapter).toEqual({
      chapterId: 'c1',
      title: '1. Chapter 1',
      durationMs: 20 * 60_000,
    });
  });

  it('normalizes imported numeric drift before calculating display stats', () => {
    const stats = buildReadingStats({
      chapters: [
        chapter('c1', 1, -100),
        chapter('c2', 2, Number.POSITIVE_INFINITY),
        chapter('c3', 3, 900),
      ],
      progress: {
        ...progress,
        chapterId: 'c2',
        chapterOrderIndex: 3,
        chapterProgress: Number.NaN,
        overallProgress: Number.NaN,
      },
      annotations: [],
      timelineEntries: [
        { ...entry('t1', 'translate', -10, Number.POSITIVE_INFINITY), costAmount: -0.5 },
        { ...entry('t2', 'chat', 12.9, 3.1), costAmount: Number.NaN },
        { ...entry('t3', 'summarize', 7, 2), costAmount: 0.025 },
      ],
      readingSessions: [session('s1', new Date(2026, 0, 2, 10), 30 * 60_000)],
      dailyGoalMinutes: Number.POSITIVE_INFINITY,
      now: new Date(Number.NaN),
    });

    expect(stats.progressPercent).toBe(67);
    expect(stats.estimatedReadWords).toBe(0);
    expect(stats.totalWords).toBe(900);
    expect(stats.ai.inputTokens).toBe(19);
    expect(stats.ai.outputTokens).toBe(5);
    expect(stats.ai.costUSD).toBe(0.025);
    expect(stats.readingTime.dailyGoalMinutes).toBe(0);
    expect(stats.readingTime.dailyGoalPercent).toBe(0);
    expect(stats.readingTime.remainingTodayMs).toBe(0);
    expect(stats.readingTime.goalMet).toBe(false);
    expect(Number.isFinite(stats.readingTime.wordsPerMinute)).toBe(true);
    expect(Number.isFinite(stats.readingTime.aiInteractionsPerHour)).toBe(true);
  });

  it('keeps corrupted chapter order indexes out of display labels', () => {
    const stats = buildReadingStats({
      chapters: [
        chapter('c1', 1, 1000),
        { ...chapter('c2', Number.POSITIVE_INFINITY, 2000), title: 'Broken current chapter' },
        { ...chapter('c3', 99, 3000), title: 'Broken most-read chapter' },
      ],
      progress: {
        ...progress,
        chapterId: 'c2',
        overallProgress: 0.5,
      },
      annotations: [],
      timelineEntries: [],
      readingSessions: [
        { ...session('s1', new Date(2026, 0, 2, 10), 30 * 60_000), chapterId: 'c3' },
      ],
      now: new Date(2026, 0, 2, 12),
    });

    expect(stats.currentChapterLabel).toBe('Broken current chapter');
    expect(stats.readingTime.mostReadChapter).toEqual({
      chapterId: 'c3',
      title: 'Broken most-read chapter',
      durationMs: 30 * 60_000,
    });
  });

  it('keeps corrupted timeline entries from crashing AI stats', () => {
    const corruptedEntry = {
      ...entry('t2', 'chat'),
      type: 'obsolete-task',
      costTokens: undefined,
      costAmount: 0.02,
    } as unknown as TimelineEntry;

    const stats = buildReadingStats({
      chapters: [chapter('c1', 1, 1000)],
      progress,
      annotations: [],
      timelineEntries: [
        entry('t1', 'translate', 12.8, 3.2),
        corruptedEntry,
      ],
      readingSessions: [],
    });

    expect(stats.ai.total).toBe(2);
    expect(stats.ai.byType.translate).toBe(1);
    expect(stats.ai.byType.chat).toBe(0);
    expect(stats.ai.inputTokens).toBe(12);
    expect(stats.ai.outputTokens).toBe(3);
    expect(stats.ai.costUSD).toBeCloseTo(0.03);
  });

  it('recovers persisted progress with a non-finite chapter order index', () => {
    const stats = buildReadingStats({
      chapters: [
        chapter('c1', 1, 1000),
        chapter('c2', 2, 2000),
        chapter('c3', 3, 3000),
      ],
      progress: {
        ...progress,
        chapterId: 'c2',
        chapterOrderIndex: Number.POSITIVE_INFINITY,
        chapterProgress: 0.5,
        overallProgress: Number.NaN,
      },
      annotations: [],
      timelineEntries: [],
      readingSessions: [],
    });

    expect(stats.progressPercent).toBe(50);
    expect(stats.estimatedReadWords).toBe(2000);
  });

  it('does not count yesterday-only reading as current streak', () => {
    const stats = buildReadingStats({
      chapters: [chapter('c1', 1, 1000)],
      progress,
      annotations: [],
      timelineEntries: [],
      readingSessions: [session('s1', new Date(2026, 0, 1, 10), 30 * 60_000)],
      now: new Date(2026, 0, 2, 12),
    });

    expect(stats.readingTime.activeDays).toBe(1);
    expect(stats.readingTime.currentStreakDays).toBe(0);
  });

  it('returns empty stats before reading starts', () => {
    const stats = buildReadingStats({
      chapters: [chapter('c1', 1, 1000)],
      progress: null,
      annotations: [],
      timelineEntries: [],
      readingSessions: [],
    });

    expect(stats.progressPercent).toBe(0);
    expect(stats.currentChapterLabel).toBe('尚未开始');
    expect(stats.completedChapters).toBe(0);
    expect(stats.estimatedReadWords).toBe(0);
    expect(stats.ai.total).toBe(0);
    expect(stats.readingTime.totalMs).toBe(0);
    expect(stats.readingTime.wordsPerMinute).toBe(0);
    expect(stats.readingTime.dailyGoalPercent).toBe(0);
    expect(stats.readingTime.goalMet).toBe(false);
    expect(stats.readingTime.activeDays).toBe(0);
    expect(stats.readingTime.currentStreakDays).toBe(0);
    expect(stats.readingTime.favoriteHourLabel).toBe('暂无');
    expect(stats.readingTime.aiInteractionsPerHour).toBe(0);
    expect(stats.readingTime.recentDays).toHaveLength(7);
    expect(stats.readingTime.recentDays.every(day => day.durationMs === 0)).toBe(true);
    expect(stats.readingTime.mostReadChapter).toBeUndefined();
  });

  it('builds a library-level dashboard from book records', () => {
    const stats = buildLibraryStats({
      books: [book('b1', 'Alpha'), book('b2', 'Beta'), book('b3', 'Gamma')],
      progressByBook: {
        b1: bookProgress('b1', 0.25, '2026-01-02T00:00:00Z'),
        b2: bookProgress('b2', 1, '2026-01-04T00:00:00Z'),
      },
      annotationsByBook: {
        b1: [annotation('a1', 'highlight'), annotation('a2', 'note')],
        b2: [annotation('a3', 'note')],
      },
      timelineByBook: {
        b1: [entry('t1', 'translate')],
        b2: [entry('t2', 'chat'), entry('t3', 'summarize')],
      },
    });

    expect(stats.totalBooks).toBe(3);
    expect(stats.activeBooks).toBe(2);
    expect(stats.completedBooks).toBe(1);
    expect(stats.averageProgressPercent).toBe(42);
    expect(stats.totalAnnotations).toBe(3);
    expect(stats.totalNotes).toBe(2);
    expect(stats.totalAiInteractions).toBe(3);
    expect(stats.totalAiCostUSD).toBeCloseTo(0.03);
    expect(stats.recentBook).toEqual({
      bookId: 'b2',
      title: 'Beta',
      progressPercent: 100,
      updatedAt: new Date('2026-01-04T00:00:00Z'),
    });
  });

  it('excludes archived books from library-level dashboard', () => {
    const stats = buildLibraryStats({
      books: [
        book('b1', 'Active'),
        { ...book('b2', 'Archived'), archivedAt: new Date('2026-01-05T00:00:00Z') },
      ],
      progressByBook: {
        b1: bookProgress('b1', 0.5, '2026-01-02T00:00:00Z'),
        b2: bookProgress('b2', 1, '2026-01-04T00:00:00Z'),
      },
      annotationsByBook: {
        b1: [annotation('a1', 'note')],
        b2: [annotation('a2', 'note')],
      },
      timelineByBook: {
        b1: [entry('t1', 'chat')],
        b2: [entry('t2', 'chat'), entry('t3', 'summarize')],
      },
    });

    expect(stats.totalBooks).toBe(1);
    expect(stats.completedBooks).toBe(0);
    expect(stats.averageProgressPercent).toBe(50);
    expect(stats.totalAnnotations).toBe(1);
    expect(stats.totalAiInteractions).toBe(1);
    expect(stats.recentBook?.bookId).toBe('b1');
  });

  it('returns empty library stats when no books exist', () => {
    const stats = buildLibraryStats({
      books: [],
      progressByBook: {},
      annotationsByBook: {},
      timelineByBook: {},
    });

    expect(stats).toEqual({
      totalBooks: 0,
      activeBooks: 0,
      completedBooks: 0,
      averageProgressPercent: 0,
      totalAnnotations: 0,
      totalNotes: 0,
      totalAiInteractions: 0,
      totalAiCostUSD: 0,
      recentBook: undefined,
    });
  });

  it('normalizes invalid library costs and progress timestamps', () => {
    const stats = buildLibraryStats({
      books: [book('b1', 'Alpha'), book('b2', 'Beta')],
      progressByBook: {
        b1: {
          ...bookProgress('b1', 0.25, 'invalid-date'),
          updatedAt: new Date(Number.NaN),
        },
        b2: bookProgress('b2', 0.5, '2026-01-04T00:00:00Z'),
      },
      annotationsByBook: {},
      timelineByBook: {
        b1: [{ ...entry('t1', 'translate'), costAmount: Number.POSITIVE_INFINITY }],
        b2: [{ ...entry('t2', 'chat'), costAmount: -1 }],
      },
    });

    expect(stats.totalAiCostUSD).toBe(0);
    expect(stats.recentBook).toEqual({
      bookId: 'b2',
      title: 'Beta',
      progressPercent: 50,
      updatedAt: new Date('2026-01-04T00:00:00Z'),
    });
  });

  it('ignores progress rows whose persisted book id does not match the book key', () => {
    const stats = buildLibraryStats({
      books: [book('b1', 'Alpha'), book('b2', 'Beta')],
      progressByBook: {
        b1: bookProgress('b2', 1, '2026-01-05T00:00:00Z'),
        b2: bookProgress('b2', 0.25, '2026-01-04T00:00:00Z'),
      },
      annotationsByBook: {},
      timelineByBook: {},
    });

    expect(stats.activeBooks).toBe(1);
    expect(stats.completedBooks).toBe(0);
    expect(stats.averageProgressPercent).toBe(13);
    expect(stats.recentBook).toEqual({
      bookId: 'b2',
      title: 'Beta',
      progressPercent: 25,
      updatedAt: new Date('2026-01-04T00:00:00Z'),
    });
  });
});
