import type {
  Annotation,
  Book,
  Chapter,
  ReadingProgress,
  ReadingSession,
  TaskType,
  TimelineEntry,
} from '@/types/domain';
import { calculateOverallProgress, clampProgress } from './reading-progress';

export interface ReadingStats {
  progressPercent: number;
  currentChapterLabel: string;
  completedChapters: number;
  totalChapters: number;
  estimatedReadWords: number;
  totalWords: number;
  annotations: {
    total: number;
    highlights: number;
    notes: number;
  };
  ai: {
    total: number;
    byType: Record<TaskType, number>;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  };
  readingTime: {
    totalMs: number;
    todayMs: number;
    sessions: number;
    wordsPerMinute: number;
    dailyGoalMinutes: number;
    dailyGoalPercent: number;
    remainingTodayMs: number;
    goalMet: boolean;
    activeDays: number;
    currentStreakDays: number;
    favoriteHourLabel: string;
    aiInteractionsPerHour: number;
    recentDays: Array<{
      date: string;
      durationMs: number;
      sessions: number;
      goalMet: boolean;
    }>;
    mostReadChapter?: {
      chapterId: string;
      title: string;
      durationMs: number;
    };
  };
}

export interface LibraryStats {
  totalBooks: number;
  activeBooks: number;
  completedBooks: number;
  averageProgressPercent: number;
  totalAnnotations: number;
  totalNotes: number;
  totalAiInteractions: number;
  totalAiCostUSD: number;
  recentBook?: {
    bookId: string;
    title: string;
    progressPercent: number;
    updatedAt: Date;
  };
}

const EMPTY_AI_BY_TYPE: Record<TaskType, number> = {
  translate: 0,
  explain: 0,
  verify: 0,
  summarize: 0,
  chat: 0,
};

const TASK_TYPES = new Set<TaskType>(Object.keys(EMPTY_AI_BY_TYPE) as TaskType[]);

export function buildReadingStats(input: {
  chapters: Chapter[];
  progress: ReadingProgress | null;
  annotations: Annotation[];
  timelineEntries: TimelineEntry[];
  readingSessions?: ReadingSession[];
  dailyGoalMinutes?: number;
  now?: Date;
}): ReadingStats {
  const now = normalizeDate(input.now, new Date());
  const totalChapters = input.chapters.length;
  const totalWords = input.chapters.reduce(
    (sum, chapter) => sum + normalizeNonNegativeNumber(chapter.wordCount),
    0,
  );
  const currentChapter = input.chapters.find(chapter => chapter.id === input.progress?.chapterId);
  const progress = normalizeProgress(input.progress, totalChapters, currentChapter);
  const completedChapters = Math.min(
    totalChapters,
    Math.floor(progress * totalChapters),
  );
  const estimatedReadWords = estimateReadWords(input.chapters, input.progress, currentChapter);
  const notes = input.annotations.filter(annotation => annotation.type === 'note').length;
  const ai = input.timelineEntries.reduce(
    (acc, entry) => {
      acc.total += 1;
      if (isTaskType(entry.type)) {
        acc.byType[entry.type] += 1;
      }
      acc.inputTokens += normalizeTokenCount(entry.costTokens?.input);
      acc.outputTokens += normalizeTokenCount(entry.costTokens?.output);
      acc.costUSD += normalizeNonNegativeNumber(entry.costAmount);
      return acc;
    },
    {
      total: 0,
      byType: { ...EMPTY_AI_BY_TYPE },
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
    },
  );
  const readingSessions = normalizeReadingSessions(input.readingSessions ?? []);
  const totalReadingMs = readingSessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationMs),
    0,
  );
  const readingTimeByDay = buildReadingTimeByDay(readingSessions);
  const todayKey = dayKey(now);
  const todayMs = readingTimeByDay.get(todayKey)?.durationMs ?? 0;
  const readingMinutes = totalReadingMs / 60_000;
  const dailyGoalMinutes = normalizeDailyGoalMinutes(input.dailyGoalMinutes);
  const dailyGoalMs = dailyGoalMinutes * 60_000;
  const activeDayKeys = new Set(readingTimeByDay.keys());
  const currentStreakDays = calculateCurrentStreak(activeDayKeys, now);
  const favoriteHourLabel = calculateFavoriteHourLabel(readingSessions);
  const readingHours = totalReadingMs / 3_600_000;
  const recentDays = buildRecentReadingDays(
    readingSessions,
    now,
    dailyGoalMs,
  );
  const mostReadChapter = calculateMostReadChapter(readingSessions, input.chapters);

  return {
    progressPercent: Math.round(progress * 100),
    currentChapterLabel: currentChapter
      ? formatChapterLabel(currentChapter, totalChapters)
      : '尚未开始',
    completedChapters,
    totalChapters,
    estimatedReadWords,
    totalWords,
    annotations: {
      total: input.annotations.length,
      highlights: input.annotations.length - notes,
      notes,
    },
    ai,
    readingTime: {
      totalMs: totalReadingMs,
      todayMs,
      sessions: readingSessions.length,
      wordsPerMinute: readingMinutes > 0
        ? Math.round(estimatedReadWords / readingMinutes)
        : 0,
      dailyGoalMinutes,
      dailyGoalPercent: dailyGoalMs > 0
        ? Math.min(100, Math.round((todayMs / dailyGoalMs) * 100))
        : 0,
      remainingTodayMs: Math.max(0, dailyGoalMs - todayMs),
      goalMet: dailyGoalMs > 0 && todayMs >= dailyGoalMs,
      activeDays: activeDayKeys.size,
      currentStreakDays,
      favoriteHourLabel,
      aiInteractionsPerHour: readingHours > 0
        ? Math.round((input.timelineEntries.length / readingHours) * 10) / 10
        : 0,
      recentDays,
      mostReadChapter,
    },
  };
}

export function buildLibraryStats(input: {
  books: Book[];
  progressByBook: Record<string, ReadingProgress>;
  annotationsByBook: Record<string, Annotation[]>;
  timelineByBook: Record<string, TimelineEntry[]>;
}): LibraryStats {
  const books = input.books.filter(book => !book.archivedAt);
  const bookIds = new Set(books.map(book => book.id));
  const progressRows = books.flatMap(book => {
    const progress = input.progressByBook[book.id];
    return progress?.bookId === book.id ? [progress] : [];
  });
  const totalProgress = progressRows.reduce(
    (sum, progress) => sum + clampProgress(progress.overallProgress),
    0,
  );
  const completedBooks = progressRows.filter(
    progress => clampProgress(progress.overallProgress) >= 0.995,
  ).length;
  const recentProgress = [...progressRows].sort(
    (a, b) => dateTimeOrZero(b.updatedAt) - dateTimeOrZero(a.updatedAt),
  )[0];
  const recentBook = recentProgress
    ? books.find(book => book.id === recentProgress.bookId)
    : undefined;
  const allAnnotations = Object.entries(input.annotationsByBook)
    .filter(([bookId]) => bookIds.has(bookId))
    .flatMap(([, annotations]) => annotations);
  const allEntries = Object.entries(input.timelineByBook)
    .filter(([bookId]) => bookIds.has(bookId))
    .flatMap(([, entries]) => entries);

  return {
    totalBooks: books.length,
    activeBooks: progressRows.length,
    completedBooks,
    averageProgressPercent: books.length
      ? Math.round((totalProgress / books.length) * 100)
      : 0,
    totalAnnotations: allAnnotations.length,
    totalNotes: allAnnotations.filter(annotation => annotation.type === 'note').length,
    totalAiInteractions: allEntries.length,
    totalAiCostUSD: allEntries.reduce(
      (sum, entry) => sum + normalizeNonNegativeNumber(entry.costAmount),
      0,
    ),
    recentBook: recentBook
      ? {
          bookId: recentBook.id,
          title: recentBook.title,
          progressPercent: Math.round(clampProgress(recentProgress.overallProgress) * 100),
          updatedAt: normalizeDate(recentProgress.updatedAt, new Date(0)),
        }
      : undefined,
  };
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === 'string' && TASK_TYPES.has(value as TaskType);
}

function normalizeNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeTokenCount(value: unknown): number {
  return Math.floor(normalizeNonNegativeNumber(value));
}

function normalizeDailyGoalMinutes(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function formatChapterLabel(chapter: Chapter, totalChapters: number): string {
  const orderIndex = normalizeDisplayChapterOrderIndex(chapter.orderIndex, totalChapters);
  return orderIndex ? `${orderIndex}. ${chapter.title}` : chapter.title;
}

function normalizeDisplayChapterOrderIndex(value: unknown, totalChapters: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return null;
  const orderIndex = Math.floor(value);
  return orderIndex <= totalChapters ? orderIndex : null;
}

function normalizeProgress(
  progress: ReadingProgress | null,
  totalChapters: number,
  currentChapter?: Chapter,
): number {
  if (!progress) return 0;
  if (Number.isFinite(progress.overallProgress)) return clampProgress(progress.overallProgress);
  const chapterOrderIndex = Number.isFinite(progress.chapterOrderIndex)
    ? progress.chapterOrderIndex
    : currentChapter?.orderIndex ?? progress.chapterOrderIndex;
  return calculateOverallProgress(
    chapterOrderIndex,
    totalChapters,
    progress.chapterProgress,
  );
}

function estimateReadWords(
  chapters: Chapter[],
  progress: ReadingProgress | null,
  currentChapter?: Chapter,
): number {
  if (!progress) return 0;
  const chapterOrderIndex = normalizeProgressChapterOrderIndex(
    progress.chapterOrderIndex,
    chapters.length,
    currentChapter,
  );
  let total = 0;
  for (const chapter of chapters) {
    if (chapter.orderIndex < chapterOrderIndex) {
      total += normalizeNonNegativeNumber(chapter.wordCount);
    } else if (chapter.id === progress.chapterId) {
      total += Math.round(
        normalizeNonNegativeNumber(chapter.wordCount) * clampProgress(progress.chapterProgress),
      );
    }
  }
  return total;
}

function normalizeProgressChapterOrderIndex(
  value: number,
  totalChapters: number,
  currentChapter?: Chapter,
): number {
  if (totalChapters <= 0) return 0;
  const candidate = Number.isFinite(value)
    ? value
    : currentChapter?.orderIndex ?? 1;
  if (!Number.isFinite(candidate) || candidate < 1) return 1;
  return Math.min(totalChapters, Math.floor(candidate));
}

function normalizeReadingSessions(sessions: ReadingSession[]): ReadingSession[] {
  return sessions.filter(session => (
    isValidDate(session.startedAt)
    && Number.isFinite(session.durationMs)
    && session.durationMs > 0
  ));
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeDate(value: Date | undefined, fallback: Date): Date {
  if (isValidDate(value)) return value;
  if (isValidDate(fallback)) return fallback;
  return new Date(0);
}

function dateTimeOrZero(value: Date): number {
  return isValidDate(value) ? value.getTime() : 0;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function calculateCurrentStreak(activeDayKeys: Set<string>, now: Date): number {
  let cursor = startOfLocalDay(now);
  let streak = 0;
  while (activeDayKeys.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

function calculateFavoriteHourLabel(sessions: ReadingSession[]): string {
  if (sessions.length === 0) return '暂无';
  const buckets = new Array<number>(24).fill(0);
  for (const session of sessions) {
    buckets[session.startedAt.getHours()] += Math.max(0, session.durationMs);
  }
  let bestHour = 0;
  for (let hour = 1; hour < buckets.length; hour++) {
    if (buckets[hour] > buckets[bestHour]) bestHour = hour;
  }
  if (buckets[bestHour] <= 0) return '暂无';
  const nextHour = (bestHour + 1) % 24;
  return `${String(bestHour).padStart(2, '0')}:00-${String(nextHour).padStart(2, '0')}:00`;
}

function buildRecentReadingDays(
  sessions: ReadingSession[],
  now: Date,
  dailyGoalMs: number,
): ReadingStats['readingTime']['recentDays'] {
  const byDay = buildReadingTimeByDay(sessions);

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - offset));
    const key = dayKey(date);
    const value = byDay.get(key) ?? { durationMs: 0, sessions: 0 };
    return {
      date: key,
      durationMs: value.durationMs,
      sessions: value.sessions,
      goalMet: dailyGoalMs > 0 && value.durationMs >= dailyGoalMs,
    };
  });
}

function buildReadingTimeByDay(
  sessions: ReadingSession[],
): Map<string, { durationMs: number; sessions: number }> {
  const byDay = new Map<string, { durationMs: number; sessions: number }>();

  for (const session of sessions) {
    const touchedDays = new Set<string>();
    for (const slice of splitSessionByLocalDay(session)) {
      const current = byDay.get(slice.date) ?? { durationMs: 0, sessions: 0 };
      current.durationMs += slice.durationMs;
      if (!touchedDays.has(slice.date)) {
        current.sessions += 1;
        touchedDays.add(slice.date);
      }
      byDay.set(slice.date, current);
    }
  }

  return byDay;
}

function splitSessionByLocalDay(
  session: ReadingSession,
): Array<{ date: string; durationMs: number }> {
  const durationMs = Math.max(0, session.durationMs);
  if (durationMs <= 0) return [];

  const slices: Array<{ date: string; durationMs: number }> = [];
  let cursor = new Date(session.startedAt);
  const end = new Date(session.startedAt.getTime() + durationMs);

  while (cursor < end) {
    const nextDay = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    );
    const sliceEnd = nextDay < end ? nextDay : end;
    slices.push({
      date: dayKey(cursor),
      durationMs: sliceEnd.getTime() - cursor.getTime(),
    });
    cursor = sliceEnd;
  }

  return slices;
}

function calculateMostReadChapter(
  sessions: ReadingSession[],
  chapters: Chapter[],
): ReadingStats['readingTime']['mostReadChapter'] {
  const byChapter = new Map<string, number>();
  for (const session of sessions) {
    byChapter.set(
      session.chapterId,
      (byChapter.get(session.chapterId) ?? 0) + Math.max(0, session.durationMs),
    );
  }
  let best: { chapterId: string; durationMs: number } | null = null;
  for (const [chapterId, durationMs] of byChapter) {
    if (!best || durationMs > best.durationMs) best = { chapterId, durationMs };
  }
  if (!best || best.durationMs <= 0) return undefined;
  const chapter = chapters.find(item => item.id === best.chapterId);
  return {
    chapterId: best.chapterId,
    title: chapter ? formatChapterLabel(chapter, chapters.length) : '未知章节',
    durationMs: best.durationMs,
  };
}
