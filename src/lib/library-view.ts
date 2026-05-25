import type { Book, ReadingProgress } from '@/types/domain';
import { clampProgress } from './reading-progress';

export type LibrarySortKey = 'recent' | 'title' | 'uploaded' | 'progress';
export type LibraryStatusFilter = 'all' | 'unread' | 'reading' | 'completed';
export type LibraryArchiveFilter = 'active' | 'archived' | 'all';

export interface LibraryViewOptions {
  query: string;
  sortKey: LibrarySortKey;
  status: LibraryStatusFilter;
  archive: LibraryArchiveFilter;
}

const LIBRARY_SORT_KEYS: readonly LibrarySortKey[] = ['recent', 'title', 'uploaded', 'progress'];
const LIBRARY_STATUS_FILTERS: readonly LibraryStatusFilter[] = [
  'all',
  'unread',
  'reading',
  'completed',
];
const LIBRARY_ARCHIVE_FILTERS: readonly LibraryArchiveFilter[] = ['active', 'archived', 'all'];

export function buildLibraryView(
  books: Book[],
  progressByBook: Record<string, ReadingProgress>,
  options: LibraryViewOptions,
): Book[] {
  const normalizedOptions = normalizeLibraryViewOptions(options);
  const query = normalizeSearchText(normalizedOptions.query);

  return books
    .filter(book => matchesQuery(book, query))
    .filter(book => matchesArchive(book, normalizedOptions.archive))
    .filter(book => matchesStatus(progressByBook[book.id], normalizedOptions.status))
    .sort((a, b) => compareBooks(a, b, progressByBook, normalizedOptions.sortKey));
}

function matchesQuery(book: Book, query: string): boolean {
  if (!query) return true;
  return [book.title, book.author, book.fileName]
    .filter(Boolean)
    .some(value => normalizeSearchText(value).includes(query));
}

function normalizeSearchText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\s_-]+/g, ' ').toLowerCase();
}

function normalizeLibraryViewOptions(options: LibraryViewOptions): LibraryViewOptions {
  return {
    query: typeof options.query === 'string' ? options.query : '',
    sortKey: LIBRARY_SORT_KEYS.includes(options.sortKey) ? options.sortKey : 'recent',
    status: LIBRARY_STATUS_FILTERS.includes(options.status) ? options.status : 'all',
    archive: LIBRARY_ARCHIVE_FILTERS.includes(options.archive) ? options.archive : 'active',
  };
}

function matchesArchive(book: Book, archive: LibraryArchiveFilter): boolean {
  if (archive === 'all') return true;
  const archived = Boolean(book.archivedAt);
  return archive === 'archived' ? archived : !archived;
}

function matchesStatus(
  progress: ReadingProgress | undefined,
  status: LibraryStatusFilter,
): boolean {
  if (status === 'all') return true;
  const value = progress ? clampProgress(progress.overallProgress) : 0;
  if (status === 'unread') return !progress || value <= 0;
  if (status === 'completed') return value >= 0.995;
  return value > 0 && value < 0.995;
}

function compareBooks(
  a: Book,
  b: Book,
  progressByBook: Record<string, ReadingProgress>,
  sortKey: LibrarySortKey,
): number {
  if (sortKey === 'title') {
    return compareText(a.title, b.title);
  }
  if (sortKey === 'uploaded') {
    return timeValue(b.uploadedAt) - timeValue(a.uploadedAt);
  }
  if (sortKey === 'progress') {
    return progressValue(progressByBook[b.id]) - progressValue(progressByBook[a.id]);
  }
  return recentTime(b, progressByBook) - recentTime(a, progressByBook);
}

function progressValue(progress: ReadingProgress | undefined): number {
  return progress ? clampProgress(progress.overallProgress) : 0;
}

function recentTime(book: Book, progressByBook: Record<string, ReadingProgress>): number {
  return (
    validTime(progressByBook[book.id]?.updatedAt) ??
    validTime(book.lastReadAt) ??
    timeValue(book.uploadedAt)
  );
}

function compareText(a: unknown, b: unknown): number {
  return safeText(a).localeCompare(safeText(b), 'zh-CN', {
    sensitivity: 'base',
    numeric: true,
  });
}

function timeValue(date: Date): number {
  return validTime(date) ?? 0;
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function validTime(date: Date | undefined): number | undefined {
  if (!date) return undefined;
  const time = date.getTime();
  return Number.isFinite(time) ? time : undefined;
}
