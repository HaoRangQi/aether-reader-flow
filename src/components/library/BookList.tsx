'use client';

import { useEffect, useState } from 'react';
import type { Book } from '@/types/domain';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { BookCard } from './BookCard';
import { EmptyLibrary } from './EmptyLibrary';
import { UploadDialog } from './UploadDialog';
import { BookCardSkeleton } from '@/components/shared/Skeleton';
import { useT } from '@/components/shared/I18nProvider';

/**
 * Library view. Loads books from IndexedDB on mount and after every upload.
 */
export function BookList() {
  const t = useT();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const reload = async () => {
    const list = await new IndexedDBBookRepo().list();
    setBooks(list);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await new IndexedDBBookRepo().list();
      if (cancelled) return;
      setBooks(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While books is null (still loading IndexedDB), show skeletons.
  if (books === null) {
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
