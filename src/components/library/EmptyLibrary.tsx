'use client';

import { useT } from '@/components/shared/I18nProvider';

/**
 * Empty-library state. Big call to action to upload the first book.
 */
export function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="text-2xl font-serif text-foreground mb-3">
        {t('library.empty.title')}
      </div>
      <div className="text-sm text-muted mb-8 max-w-md">
        {t('library.empty.description')}
      </div>
      <button
        onClick={onUpload}
        className="rounded-md bg-accent text-white px-6 py-2.5 text-sm hover:bg-[var(--color-accent-hover)] transition"
      >
        {t('library.upload')}
      </button>
    </div>
  );
}
