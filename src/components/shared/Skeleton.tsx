/**
 * Skeleton loading placeholders.
 *
 * - `<Skeleton />`: a single bar
 * - `<BookCardSkeleton />`: matches BookCard footprint
 * - `<ChapterContentSkeleton />`: matches the reader article width
 *
 * All use `animate-pulse` from Tailwind for the shimmer. `bg-surface-elevated/60`
 * adapts to the current theme automatically.
 */
import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx('animate-pulse rounded', className)}
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-surface-elevated) 60%, transparent)' }}
    />
  );
}

export function BookCardSkeleton() {
  return (
    <div className="rounded-lg border border-border p-5 bg-surface">
      <Skeleton className="h-5 w-3/4 mb-2" />
      <Skeleton className="h-4 w-1/2 mb-4" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

export function ChapterContentSkeleton() {
  return (
    <div className="max-w-[720px] mx-auto space-y-3">
      <Skeleton className="h-10 w-2/3 mb-6" />
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className={clsx('h-4', i % 3 === 2 ? 'w-5/6' : 'w-full')} />
      ))}
    </div>
  );
}
