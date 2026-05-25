'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/shared/I18nProvider';

/**
 * Empty-library state. Big call to action to upload the first book.
 */
export function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  const t = useT();
  const titleId = 'empty-library-title';
  const descriptionId = 'empty-library-description';
  const [uploadBusy, setUploadBusy] = useState(false);
  const uploadResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (uploadResetTimer.current) {
        clearTimeout(uploadResetTimer.current);
      }
    };
  }, []);

  function handleUpload() {
    if (uploadBusy) return;

    setUploadBusy(true);
    onUpload();

    uploadResetTimer.current = setTimeout(() => {
      setUploadBusy(false);
      uploadResetTimer.current = null;
    }, 500);
  }

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <h2 id={titleId} className="text-2xl font-serif text-foreground mb-3">
        {t('library.empty.title')}
      </h2>
      <p id={descriptionId} className="text-sm text-muted mb-8 max-w-md">
        {t('library.empty.description')}
      </p>
      <button
        onClick={handleUpload}
        disabled={uploadBusy}
        aria-label={t('library.upload')}
        aria-describedby={descriptionId}
        className="rounded-md bg-accent text-white px-6 py-2.5 text-sm hover:bg-[var(--color-accent-hover)] transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('library.upload')}
      </button>
    </section>
  );
}
