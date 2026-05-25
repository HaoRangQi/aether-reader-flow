'use client';

import { useEffect, useRef, useState } from 'react';
import type { Book, ReadingProgress } from '@/types/domain';
import { IndexedDBAnnotationRepo } from '@/adapters/storage/IndexedDBAnnotationRepo';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBReadingProgressRepo } from '@/adapters/storage/IndexedDBReadingProgressRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { ExportService, type ExportFormat } from '@/services/ExportService';
import {
  buildLibraryView,
  type LibraryArchiveFilter,
  type LibrarySortKey,
  type LibraryStatusFilter,
} from '@/lib/library-view';
import { buildLibraryStats, type LibraryStats } from '@/lib/reading-stats';
import { BookCard } from './BookCard';
import { EmptyLibrary } from './EmptyLibrary';
import { LibraryStatsPanel } from './LibraryStatsPanel';
import { UploadDialog } from './UploadDialog';
import { BookCardSkeleton } from '@/components/shared/Skeleton';
import { useT } from '@/components/shared/I18nProvider';
import { Archive, ArchiveRestore, Download, Search } from 'lucide-react';

/**
 * Library view. Loads books from IndexedDB on mount and after every upload.
 */
export function BookList() {
  const t = useT();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progressByBook, setProgressByBook] = useState<Record<string, ReadingProgress>>({});
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<LibrarySortKey>('recent');
  const [status, setStatus] = useState<LibraryStatusFilter>('all');
  const [archiveFilter, setArchiveFilter] = useState<LibraryArchiveFilter>('active');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [batchExportFormat, setBatchExportFormat] = useState<ExportFormat>('markdown');
  const [batchExportBusy, setBatchExportBusy] = useState(false);
  const [batchExportError, setBatchExportError] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [singleArchiveBusyIds, setSingleArchiveBusyIds] = useState<Set<string>>(() => new Set());
  const singleArchiveBusyRef = useRef<Set<string>>(new Set());
  const visibleBooks = books
    ? buildLibraryView(books, progressByBook, { query, sortKey, status, archive: archiveFilter })
    : [];
  const batchArchiveCandidateCount = visibleBooks.filter(book => (
    archiveFilter === 'archived' ? book.archivedAt : !book.archivedAt
  )).length;

  const reload = async () => {
    const { list, progress, stats } = await loadLibraryData();
    setBooks(list);
    setProgressByBook(progress);
    setLibraryStats(stats);
    setLoadError(null);
  };

  const deleteBook = async (book: Book) => {
    if (!confirm(`删除《${book.title}》？相关章节、批注、时间轴和阅读进度也会一并删除。`)) {
      return;
    }
    setDeleteError(null);
    try {
      await new IndexedDBBookRepo().delete(book.id);
      await reload();
    } catch (error) {
      setDeleteError(formatOperationError('删除失败', error));
    }
  };

  const archiveBook = async (book: Book) => {
    await updateSingleArchiveState(book, '归档失败', () => new IndexedDBBookRepo().archive(book.id));
  };

  const restoreBook = async (book: Book) => {
    await updateSingleArchiveState(book, '恢复失败', () => new IndexedDBBookRepo().restore(book.id));
  };

  const updateSingleArchiveState = async (
    book: Book,
    errorPrefix: string,
    updateBook: () => Promise<void>,
  ) => {
    if (singleArchiveBusyRef.current.has(book.id)) return;
    singleArchiveBusyRef.current.add(book.id);
    setSingleArchiveBusyIds(previous => new Set(previous).add(book.id));
    setArchiveError(null);
    try {
      await updateBook();
      await reload();
    } catch (error) {
      setArchiveError(formatOperationError(errorPrefix, error));
    } finally {
      singleArchiveBusyRef.current.delete(book.id);
      setSingleArchiveBusyIds(previous => {
        const next = new Set(previous);
        next.delete(book.id);
        return next;
      });
    }
  };

  const updateVisibleArchiveState = async () => {
    if (batchArchiveCandidateCount === 0 || archiveBusy) return;
    setArchiveBusy(true);
    setArchiveError(null);
    const errorPrefix = archiveFilter === 'archived' ? '恢复失败' : '归档失败';
    const repo = new IndexedDBBookRepo();
    try {
      if (archiveFilter === 'archived') {
        await Promise.all(visibleBooks.map(book => repo.restore(book.id)));
      } else {
        await Promise.all(
          visibleBooks
            .filter(book => !book.archivedAt)
            .map(book => repo.archive(book.id)),
        );
      }
      await reload();
    } catch (error) {
      setArchiveError(formatOperationError(errorPrefix, error));
    } finally {
      setArchiveBusy(false);
    }
  };

  const exportVisibleBooks = async () => {
    if (visibleBooks.length === 0 || batchExportBusy) return;
    setBatchExportBusy(true);
    setBatchExportError(null);
    try {
      const svc = new ExportService(
        new IndexedDBBookRepo(),
        new IndexedDBChapterRepo(),
        new IndexedDBTimelineRepo(),
        new IndexedDBAnnotationRepo(),
      );
      const blob = await svc.toZip(
        visibleBooks.map(book => book.id),
        { format: batchExportFormat },
      );
      const suffix = new Date().toISOString().slice(0, 10);
      downloadBlob(`aether-reader-flow-${batchExportFormat}-${suffix}.zip`, blob);
    } catch (error) {
      setBatchExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchExportBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { list, progress, stats } = await loadLibraryData();
        if (cancelled) return;
        setBooks(list);
        setProgressByBook(progress);
        setLibraryStats(stats);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(formatOperationError('加载书架失败', error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retryInitialLoad = () => {
    setBooks(null);
    setLoadError(null);
    void reload().catch(error => {
      setLoadError(formatOperationError('加载书架失败', error));
    });
  };

  // While books is null (still loading IndexedDB), show skeletons.
  if (books === null) {
    if (loadError) {
      return (
        <div>
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif text-3xl">{t('library.title')}</h1>
          </div>
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="text-sm text-danger" role="alert">
              {loadError}
            </div>
            <button
              type="button"
              onClick={retryInitialLoad}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)]"
            >
              重试加载
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-3xl">{t('library.title')}</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-3xl">{t('library.title')}</h1>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-md bg-accent text-white px-4 py-2 text-sm hover:bg-[var(--color-accent-hover)]"
        >
          {t('library.upload')}
        </button>
      </div>

      {books.length === 0 ? (
        <EmptyLibrary onUpload={() => setUploadOpen(true)} />
      ) : (
        <>
          {libraryStats && <LibraryStatsPanel stats={libraryStats} />}
          <LibraryToolbar
            query={query}
            sortKey={sortKey}
            status={status}
            archiveFilter={archiveFilter}
            visibleCount={visibleBooks.length}
            totalCount={books.length}
            batchArchiveCandidateCount={batchArchiveCandidateCount}
            archiveBusy={archiveBusy}
            archiveError={archiveError}
            deleteError={deleteError}
            exportFormat={batchExportFormat}
            exportBusy={batchExportBusy}
            exportError={batchExportError}
            onQueryChange={setQuery}
            onSortChange={setSortKey}
            onStatusChange={setStatus}
            onArchiveFilterChange={setArchiveFilter}
            onExportFormatChange={setBatchExportFormat}
            onBatchArchive={() => void updateVisibleArchiveState()}
            onBatchExport={() => void exportVisibleBooks()}
          />
          {visibleBooks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
              没有匹配的书籍
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {visibleBooks.map(b => (
                <BookCard
                  key={b.id}
                  book={b}
                  progress={progressByBook[b.id]}
                  onArchive={singleArchiveBusyIds.has(b.id) ? undefined : archiveBook}
                  onRestore={singleArchiveBusyIds.has(b.id) ? undefined : restoreBook}
                  onDelete={deleteBook}
                />
              ))}
            </div>
          )}
        </>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={reload}
      />
    </div>
  );
}

function LibraryToolbar({
  query,
  sortKey,
  status,
  archiveFilter,
  visibleCount,
  totalCount,
  batchArchiveCandidateCount,
  archiveBusy,
  archiveError,
  deleteError,
  exportFormat,
  exportBusy,
  exportError,
  onQueryChange,
  onSortChange,
  onStatusChange,
  onArchiveFilterChange,
  onExportFormatChange,
  onBatchArchive,
  onBatchExport,
}: {
  query: string;
  sortKey: LibrarySortKey;
  status: LibraryStatusFilter;
  archiveFilter: LibraryArchiveFilter;
  visibleCount: number;
  totalCount: number;
  batchArchiveCandidateCount: number;
  archiveBusy: boolean;
  archiveError: string | null;
  deleteError: string | null;
  exportFormat: ExportFormat;
  exportBusy: boolean;
  exportError: string | null;
  onQueryChange: (value: string) => void;
  onSortChange: (value: LibrarySortKey) => void;
  onStatusChange: (value: LibraryStatusFilter) => void;
  onArchiveFilterChange: (value: LibraryArchiveFilter) => void;
  onExportFormatChange: (value: ExportFormat) => void;
  onBatchArchive: () => void;
  onBatchExport: () => void;
}) {
  const archiveActionLabel = archiveFilter === 'archived'
    ? '恢复当前列表'
    : archiveFilter === 'all'
      ? '归档当前未归档'
      : '归档当前列表';
  const ArchiveActionIcon = archiveFilter === 'archived' ? ArchiveRestore : Archive;
  const exportFormatLabel = exportFormat === 'markdown' ? 'Markdown ZIP' : 'HTML ZIP';
  const resultSummary = `当前筛选显示 ${visibleCount} 本，共 ${totalCount} 本`;
  const exportDisabledReason = visibleCount === 0 ? '当前筛选没有可导出的书籍' : undefined;
  const archiveDisabledReason = batchArchiveCandidateCount === 0
    ? '当前筛选没有可归档或恢复的书籍'
    : undefined;

  return (
    <div
      className="mb-5 rounded-lg border border-border bg-surface p-3"
      role="region"
      aria-label="书架筛选与批量操作"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block lg:w-80">
          <span className="sr-only">搜索书名、作者或文件名</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="搜索书名、作者或文件名"
            aria-describedby="library-result-summary"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-accent"
          />
        </label>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div
            className="flex rounded-md border border-border bg-background p-1"
            role="group"
            aria-label="阅读状态筛选"
          >
            {STATUS_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusChange(option.value)}
                aria-pressed={status === option.value}
                className={`rounded px-3 py-1.5 text-xs transition ${
                  status === option.value
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div
            className="flex rounded-md border border-border bg-background p-1"
            role="group"
            aria-label="归档状态筛选"
          >
            {ARCHIVE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onArchiveFilterChange(option.value)}
                aria-pressed={archiveFilter === option.value}
                className={`rounded px-3 py-1.5 text-xs transition ${
                  archiveFilter === option.value
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <select
            value={sortKey}
            onChange={event => onSortChange(event.target.value as LibrarySortKey)}
            aria-label="书籍排序方式"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div id="library-result-summary" className="text-xs text-subtle" role="status" aria-live="polite">
            {visibleCount}/{totalCount}
            <span className="sr-only">，{resultSummary}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-divider pt-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={exportFormat}
            onChange={event => onExportFormatChange(event.target.value as ExportFormat)}
            aria-label="批量导出格式"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none transition focus:border-accent"
          >
            <option value="markdown">Markdown ZIP</option>
            <option value="html">HTML ZIP</option>
          </select>
          <button
            type="button"
            onClick={onBatchExport}
            disabled={exportBusy || visibleCount === 0}
            aria-label={exportBusy ? '正在生成导出文件' : `导出当前筛选的 ${visibleCount} 本书为 ${exportFormatLabel}`}
            title={exportDisabledReason}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
          >
            <Download size={14} />
            {exportBusy ? '生成中…' : '导出当前列表'}
          </button>
          <button
            type="button"
            onClick={onBatchArchive}
            disabled={archiveBusy || batchArchiveCandidateCount === 0}
            aria-label={
              archiveBusy
                ? '正在更新归档状态'
                : `${archiveActionLabel}，共 ${batchArchiveCandidateCount} 本`
            }
            title={archiveDisabledReason}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
          >
            <ArchiveActionIcon size={14} />
            {archiveBusy ? '处理中…' : archiveActionLabel}
          </button>
        </div>

        {archiveError && (
          <div className="text-xs text-danger" role="alert">
            {archiveError}
          </div>
        )}

        {deleteError && (
          <div className="text-xs text-danger" role="alert">
            {deleteError}
          </div>
        )}

        {exportError && (
          <div className="text-xs text-danger" role="alert">
            {exportError}
          </div>
        )}
      </div>
    </div>
  );
}

function formatOperationError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `${prefix}：${message}`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const STATUS_OPTIONS: Array<{ value: LibraryStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '在读' },
  { value: 'completed', label: '完成' },
];

const ARCHIVE_OPTIONS: Array<{ value: LibraryArchiveFilter; label: string }> = [
  { value: 'active', label: '当前' },
  { value: 'archived', label: '已归档' },
  { value: 'all', label: '含归档' },
];

const SORT_OPTIONS: Array<{ value: LibrarySortKey; label: string }> = [
  { value: 'recent', label: '最近阅读' },
  { value: 'uploaded', label: '最近上传' },
  { value: 'title', label: '书名' },
  { value: 'progress', label: '进度' },
];

async function loadLibraryData() {
  const list = await new IndexedDBBookRepo().list();
  const bookIds = list.map(book => book.id);
  const annotationRepo = new IndexedDBAnnotationRepo();
  const timelineRepo = new IndexedDBTimelineRepo();
  const progress = await new IndexedDBReadingProgressRepo().listByBooks(bookIds);
  const [annotationsEntries, timelineEntries] = await Promise.all([
    Promise.all(
      bookIds.map(async bookId => [bookId, await annotationRepo.listByBook(bookId)] as const),
    ),
    Promise.all(
      bookIds.map(async bookId => [bookId, await timelineRepo.listByBook(bookId)] as const),
    ),
  ]);
  const annotationsByBook = Object.fromEntries(annotationsEntries);
  const timelineByBook = Object.fromEntries(timelineEntries);
  const stats = buildLibraryStats({
    books: list,
    progressByBook: progress,
    annotationsByBook,
    timelineByBook,
  });

  return { list, progress, stats };
}
