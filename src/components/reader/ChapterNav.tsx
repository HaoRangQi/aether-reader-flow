'use client';

import clsx from 'clsx';
import { type KeyboardEvent, useRef } from 'react';
import { useReaderStore } from '@/stores/readerStore';

/**
 * Vertical chapter list shown in the left rail. Highlights the current
 * chapter and switches when clicked. Long titles wrap (no truncation) so
 * the user can read the full chapter heading at a glance.
 */
export function ChapterNav() {
  const { chapters, currentChapterId, setChapter } = useReaderStore();
  const chapterButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentChapterIndex = chapters.findIndex(c => c.id === currentChapterId);
  const previousChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1
      ? chapters[currentChapterIndex + 1]
      : null;

  const focusChapter = (index: number) => {
    chapterButtonRefs.current[index]?.focus();
  };

  const handleChapterKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusChapter((index + 1) % chapters.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusChapter((index - 1 + chapters.length) % chapters.length);
    }
  };

  return (
    <nav className="space-y-1" aria-label="章节导航">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            if (previousChapter) setChapter(previousChapter.id);
          }}
          disabled={!previousChapter}
          className="rounded-md border border-divider px-3 py-2 text-sm text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted"
          aria-label="上一章"
        >
          上一章
        </button>
        <button
          type="button"
          onClick={() => {
            if (nextChapter) setChapter(nextChapter.id);
          }}
          disabled={!nextChapter}
          className="rounded-md border border-divider px-3 py-2 text-sm text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted"
          aria-label="下一章"
        >
          下一章
        </button>
      </div>
      {chapters.length === 0 && (
        <div className="rounded-md border border-dashed border-divider px-3 py-4 text-sm text-subtle">
          暂无可用章节
        </div>
      )}
      {chapters.map((c, index) => (
        <button
          key={c.id}
          ref={node => {
            chapterButtonRefs.current[index] = node;
          }}
          type="button"
          onClick={() => setChapter(c.id)}
          onKeyDown={event => handleChapterKeyDown(event, index)}
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
