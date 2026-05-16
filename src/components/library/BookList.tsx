'use client';

import { useEffect, useState } from 'react';
import type { Book } from '@/types/domain';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { BookCard } from './BookCard';
import { EmptyLibrary } from './EmptyLibrary';
import { UploadDialog } from './UploadDialog';

/**
 * Library view. Loads books from IndexedDB on mount and after every upload.
 * Future iterations may add sorting, filtering, and bulk actions, but for
 * MVP the simplest grid is enough.
 */
export function BookList() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const reload = async () => {
    const list = await new IndexedDBBookRepo().list();
    setBooks(list);
  };

  useEffect(() => {
    void reload();
  }, []);

  // While books is null (still loading IndexedDB), render nothing to avoid
  // a flash of the empty state. Skeleton lands in P5.
  if (books === null) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-3xl">书架</h1>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-md bg-accent text-white px-4 py-2 text-sm hover:bg-[var(--color-accent-hover)]"
        >
          上传 PDF
        </button>
      </div>

      {books.length === 0 ? (
        <EmptyLibrary onUpload={() => setUploadOpen(true)} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {books.map(b => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={reload}
      />
    </div>
  );
}
