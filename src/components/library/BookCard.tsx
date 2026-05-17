'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Book } from '@/types/domain';
import { ExportDialog } from './ExportDialog';
import { Download } from 'lucide-react';

/**
 * Library card representing a single uploaded book. Clicking the card
 * opens the reader; clicking the download icon opens ExportDialog
 * (stops propagation so it doesn't navigate).
 */
export function BookCard({ book }: { book: Book }) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="relative rounded-lg border border-border p-5 bg-surface hover:bg-surface-elevated transition">
      <Link href={`/reader/${book.id}`} className="block">
        <div className="text-base font-serif text-foreground line-clamp-2 pr-8">
          {book.title}
        </div>
        {book.author && (
          <div className="mt-1 text-sm text-muted">{book.author}</div>
        )}
        <div className="mt-3 text-xs text-subtle">
          {book.totalChapters} 章 · {book.totalPages} 页
        </div>
      </Link>

      <button
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setExportOpen(true);
        }}
        className="absolute top-3 right-3 p-1.5 text-muted hover:text-foreground"
        aria-label="导出"
        title="导出思考文档"
      >
        <Download size={16} />
      </button>

      <ExportDialog
        bookId={book.id}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
