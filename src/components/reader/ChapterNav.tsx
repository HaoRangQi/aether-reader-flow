'use client';

import clsx from 'clsx';
import { useReaderStore } from '@/stores/readerStore';

/**
 * Vertical chapter list shown in the left rail. Highlights the current
 * chapter and switches when clicked. Long titles wrap (no truncation) so
 * the user can read the full chapter heading at a glance.
 */
export function ChapterNav() {
  const { chapters, currentChapterId, setChapter } = useReaderStore();

  return (
    <nav className="space-y-1" aria-label="章节导航">
      {chapters.map(c => (
        <button
          key={c.id}
          onClick={() => setChapter(c.id)}
          className={clsx(
            'w-full text-left px-3 py-2 rounded-md text-sm font-serif transition',
            c.id === currentChapterId
              ? 'bg-[var(--color-accent)]/10 text-accent'
              : 'text-muted hover:bg-surface-elevated hover:text-foreground',
          )}
          aria-current={c.id === currentChapterId ? 'page' : undefined}
        >
          <span className="text-subtle mr-2">{c.orderIndex}.</span>
          {c.title}
        </button>
      ))}
    </nav>
  );
}
