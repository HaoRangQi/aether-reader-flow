'use client';

import { useReaderStore } from '@/stores/readerStore';

/**
 * Chapter body. Renders the raw text inside a 720px column at the font
 * size / line height the user picked (P4 FontPreferences feeds these vars).
 *
 * `whitespace-pre-wrap` preserves the line breaks that PDF.js inserted
 * between pages — better than losing them. P5 will add a content
 * normalization pass (de-hyphenate, join paragraph fragments) if needed.
 */
export function ChapterContent() {
  const chapter = useReaderStore(s => s.currentChapter());

  if (!chapter) {
    return (
      <div className="text-muted text-center py-20">
        请在左侧选择一个章节
      </div>
    );
  }

  return (
    <article
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
      <div className="whitespace-pre-wrap leading-relaxed">
        {chapter.content}
      </div>
    </article>
  );
}
