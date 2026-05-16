'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useReaderStore } from '@/stores/readerStore';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { ChapterNav } from './ChapterNav';
import { ChapterContent } from './ChapterContent';

/**
 * Two-column reader: chapter nav (left) + chapter body (center).
 *
 * Right rail (AI sidebar + Timeline panel) lands in P2/P3.
 */
export function ReaderView({ bookId }: { bookId: string }) {
  const { book, setBook, setChapters } = useReaderStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await new IndexedDBBookRepo().get(bookId);
      if (cancelled) return;
      if (b) setBook(b);
      const ch = await new IndexedDBChapterRepo().listByBook(bookId);
      if (cancelled) return;
      setChapters(ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, setBook, setChapters]);

  return (
    <div className="flex h-screen">
      <aside className="w-72 shrink-0 border-r border-divider p-4 overflow-y-auto">
        <Link
          href="/"
          className="block text-sm text-muted hover:text-foreground mb-4"
        >
          ← 返回书架
        </Link>
        {book && (
          <div className="mb-4 pb-4 border-b border-divider">
            <div className="font-serif text-sm text-foreground line-clamp-2">
              {book.title}
            </div>
            {book.author && (
              <div className="text-xs text-subtle mt-1">{book.author}</div>
            )}
          </div>
        )}
        <ChapterNav />
      </aside>

      <main className="flex-1 overflow-y-auto py-12 px-8">
        <ChapterContent />
      </main>
    </div>
  );
}
