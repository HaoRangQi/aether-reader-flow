'use client';

import Link from 'next/link';
import type { Book } from '@/types/domain';

/**
 * Library card representing a single uploaded book. Clicking opens the
 * reader. The card is intentionally minimal in P1; richer hover states,
 * cover art, and export actions are added in P3+.
 */
export function BookCard({ book }: { book: Book }) {
  return (
    <Link
      href={`/reader/${book.id}`}
      className="block rounded-lg border border-border p-5 bg-surface hover:bg-surface-elevated transition"
    >
      <div className="text-base font-serif text-foreground line-clamp-2">
        {book.title}
      </div>
      {book.author && (
        <div className="mt-1 text-sm text-muted">{book.author}</div>
      )}
      <div className="mt-3 text-xs text-subtle">
        {book.totalChapters} 章 · {book.totalPages} 页
      </div>
    </Link>
  );
}
