'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Book, ReadingProgress } from '@/types/domain';
import { ExportDialog } from './ExportDialog';
import { Archive, ArchiveRestore, Download, Trash2 } from 'lucide-react';
import { useT } from '@/components/shared/I18nProvider';
import { clampProgress } from '@/lib/reading-progress';

/**
 * Library card representing a single uploaded book. Clicking the card
 * opens the reader; clicking the download icon opens ExportDialog.
 */
export function BookCard({
  book,
  progress,
  onArchive,
  onRestore,
  onDelete,
}: {
  book: Book;
  progress?: ReadingProgress;
  onArchive?: (book: Book) => void;
  onRestore?: (book: Book) => void;
  onDelete?: (book: Book) => void;
}) {
  const t = useT();
  const [exportOpen, setExportOpen] = useState(false);
  const percent = progress ? Math.round(clampProgress(progress.overallProgress) * 100) : 0;
  const lastReadAt = progress?.updatedAt ?? book.lastReadAt;
  const isArchived = Boolean(book.archivedAt);

  return (
    <div className="relative rounded-lg border border-border p-5 bg-surface hover:bg-surface-elevated transition">
      <Link href={`/reader/${book.id}`} className="block">
        <div className="pr-20">
          <div className="text-base font-serif text-foreground line-clamp-2">
            {book.title}
          </div>
          {isArchived && (
            <div className="mt-1 text-xs text-subtle">已归档</div>
          )}
        </div>
        {book.author && (
          <div className="mt-1 text-sm text-muted">{book.author}</div>
        )}
        <div className="mt-3 text-xs text-subtle">
          {book.totalChapters} {t('library.chapters')} · {book.totalPages}{' '}
          {t('library.pages')}
        </div>
        {progress && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-xs text-subtle mb-1.5">
              <span className="line-clamp-1">
                {t('library.reading.at', {
                  chapter: `${progress.chapterOrderIndex}. ${progress.chapterTitle}`,
                })}
              </span>
              <span className="shrink-0">{percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div
                role="progressbar"
                aria-label={`${book.title} 阅读进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-full rounded-full bg-accent"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
        {lastReadAt && (
          <div className="mt-2 text-xs text-subtle">
            {t('library.reading.recent', {
              time: formatRelativeReadTime(lastReadAt, t),
            })}
          </div>
        )}
      </Link>

      <IconActionButton
        className="absolute top-3 right-16"
        label={t('library.export')}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setExportOpen(true);
        }}
      >
        <Download size={16} />
      </IconActionButton>

      {isArchived ? (
        onRestore && (
          <IconActionButton
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onRestore(book);
            }}
            className="absolute top-3 right-9"
            label="恢复书籍"
          >
            <ArchiveRestore size={16} />
          </IconActionButton>
        )
      ) : (
        onArchive && (
          <IconActionButton
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onArchive(book);
            }}
            className="absolute top-3 right-9"
            label="归档书籍"
          >
            <Archive size={16} />
          </IconActionButton>
        )
      )}

      {onDelete && (
        <IconActionButton
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(book);
          }}
          className="absolute top-3 right-3"
          label="删除书籍"
          danger
        >
          <Trash2 size={16} />
        </IconActionButton>
      )}

      <ExportDialog
        bookId={book.id}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

function IconActionButton({
  className,
  label,
  onClick,
  children,
  danger = false,
}: {
  className?: string;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group ${className ?? ''} p-1.5 ${
        danger ? 'text-muted hover:text-danger' : 'text-muted hover:text-foreground'
      }`}
      aria-label={label}
      title={label}
      type="button"
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-20 mt-1 whitespace-nowrap rounded border border-divider bg-surface-elevated px-2 py-1 text-[11px] text-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

function formatRelativeReadTime(value: Date, t: ReturnType<typeof useT>): string {
  const time = new Date(value).getTime();
  const diffMs = Date.now() - time;
  if (!Number.isFinite(diffMs) || diffMs < 0) return t('time.justNow');
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('time.daysAgo', { count: days });
  return new Date(value).toLocaleDateString('zh-CN');
}
