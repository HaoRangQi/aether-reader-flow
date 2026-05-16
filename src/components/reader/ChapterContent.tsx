'use client';

import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/stores/readerStore';

/**
 * Chapter body. Renders the raw text inside a 720px column at the font
 * size / line height the user picked.
 *
 * Selection detection: on mouseup inside our container, if the selection
 * lies within the chapter text, we compute character offsets and write
 * `selection` into `readerStore`. The `SelectionPopover` reacts and pops.
 */
export function ChapterContent() {
  const chapter = useReaderStore(s => s.currentChapter());
  const setSelection = useReaderStore(s => s.setSelection);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Confirm the selection is entirely within our chapter content node.
      const textEl = el.querySelector('[data-chapter-text]');
      if (!textEl || !textEl.contains(range.commonAncestorContainer)) {
        return;
      }
      const text = sel.toString().trim();
      if (text.length === 0) {
        setSelection(null);
        return;
      }

      // Compute character offsets relative to the chapter text node.
      const fullText = textEl.textContent ?? '';
      // Use a simple substring search — chapters are < 100k chars and the
      // selection is usually unique enough that the first occurrence is correct.
      const start = fullText.indexOf(text);
      const end = start + text.length;
      setSelection({ text, start, end });
    };

    el.addEventListener('mouseup', onMouseUp);
    return () => el.removeEventListener('mouseup', onMouseUp);
  }, [setSelection]);

  if (!chapter) {
    return (
      <div className="text-muted text-center py-20">
        请在左侧选择一个章节
      </div>
    );
  }

  return (
    <article
      ref={containerRef}
      className="max-w-[720px] mx-auto text-foreground"
      style={{
        fontFamily: 'var(--user-font-family)',
        fontSize: 'var(--reader-font-size)',
        lineHeight: 'var(--reader-line-height)',
      }}
    >
      <header className="mb-8">
        <div className="text-xs text-subtle font-sans mb-1">
          第 {chapter.orderIndex} 章 · 第 {chapter.startPage}–{chapter.endPage} 页
        </div>
        <h1 className="text-3xl font-serif">{chapter.title}</h1>
      </header>
      <div
        data-chapter-text
        className="whitespace-pre-wrap leading-relaxed select-text"
      >
        {chapter.content}
      </div>
    </article>
  );
}
