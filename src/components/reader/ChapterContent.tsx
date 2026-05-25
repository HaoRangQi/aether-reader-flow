'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { buildAnnotationSegments } from '@/lib/annotation-ranges';
import { anchorFromRange } from '@/lib/selection-anchor';
import type { Annotation } from '@/types/domain';

interface ChapterContentProps {
  onContextMenu?: (x: number, y: number) => void;
}

const EMPTY_ANNOTATIONS: Annotation[] = [];

export function ChapterContent({ onContextMenu }: ChapterContentProps) {
  const chapter = useReaderStore(s => s.currentChapter());
  const setSelection = useReaderStore(s => s.setSelection);
  const pendingAnchor = useReaderStore(s => s.pendingAnchor);
  const clearPendingAnchor = useReaderStore(s => s.clearPendingAnchor);
  const annotations = useAnnotationStore(s =>
    chapter ? (s.byChapter[chapter.id] ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS,
  );
  const loadAnnotations = useAnnotationStore(s => s.loadChapter);
  const containerRef = useRef<HTMLElement>(null);
  const pendingMarkerRef = useRef<HTMLElement>(null);
  const segments = useMemo(
    () => (chapter ? buildAnnotationSegments(chapter.content, annotations) : []),
    [chapter, annotations],
  );

  useEffect(() => {
    if (!chapter) return;
    void loadAnnotations(chapter.id);
  }, [chapter, loadAnnotations]);

  useEffect(() => {
    if (!chapter || !pendingAnchor || pendingAnchor.chapterId !== chapter.id) return;
    const id = window.requestAnimationFrame(() => {
      const target = pendingMarkerRef.current ?? containerRef.current;
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      clearPendingAnchor();
    });
    return () => window.cancelAnimationFrame(id);
  }, [chapter, pendingAnchor, clearPendingAnchor]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const textEl = el.querySelector('[data-chapter-text]');
      if (!textEl || !textEl.contains(range.commonAncestorContainer)) {
        return;
      }
      const anchor = anchorFromRange(textEl, range);
      if (!anchor) {
        setSelection(null);
        return;
      }
      setSelection(anchor);
    };

    const handleContextMenu = (e: MouseEvent) => {
      const sel = window.getSelection();
      const existingSelection = useReaderStore.getState().selection;
      if (!sel || sel.isCollapsed) {
        if (!existingSelection) return;
        e.preventDefault();
        onContextMenu?.(e.clientX, e.clientY);
        return;
      }
      const text = sel.toString().trim();
      if (text.length === 0) {
        if (!existingSelection) return;
        e.preventDefault();
        onContextMenu?.(e.clientX, e.clientY);
        return;
      }
      const range = sel.getRangeAt(0);
      const textEl = el.querySelector('[data-chapter-text]');
      if (!textEl || !textEl.contains(range.commonAncestorContainer)) {
        if (!existingSelection) return;
        e.preventDefault();
        onContextMenu?.(e.clientX, e.clientY);
        return;
      }
      const anchor = anchorFromRange(textEl, range);
      if (!anchor) {
        if (!existingSelection) {
          setSelection(null);
          return;
        }
        e.preventDefault();
        onContextMenu?.(e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      setSelection(anchor);
      onContextMenu?.(e.clientX, e.clientY);
    };

    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('contextmenu', handleContextMenu);
    return () => {
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [setSelection, onContextMenu]);

  if (!chapter) {
    return (
      <div className="text-muted text-center py-20">
        请在左侧选择一个章节
      </div>
    );
  }

  const jumpOffset =
    pendingAnchor?.chapterId === chapter.id
      ? (pendingAnchor.start ?? chapter.content.indexOf(pendingAnchor.text))
      : -1;

  return (
    <article
      ref={containerRef}
      className="max-w-[720px] mx-auto text-foreground"
      style={{
        fontFamily: 'var(--reader-font-family)',
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
        {segments.map((segment, index) => (
          <TextSegment
            key={`${segment.annotation?.id ?? 'plain'}-${index}`}
            segment={segment}
            jumpOffset={jumpOffset}
            markerRef={pendingMarkerRef}
          />
        ))}
      </div>
    </article>
  );
}

const TextSegment = memo(function TextSegment({
  segment,
  jumpOffset,
  markerRef,
}: {
  segment: ReturnType<typeof buildAnnotationSegments>[number];
  jumpOffset: number;
  markerRef: React.RefObject<HTMLElement | null>;
}) {
  const markerInside = jumpOffset >= segment.start && jumpOffset < segment.end;
  const localOffset = markerInside ? jumpOffset - segment.start : -1;
  const children = markerInside
    ? (
        <>
          {segment.text.slice(0, localOffset)}
          <span
            ref={markerRef}
            className="inline-block h-[1lh] align-baseline"
            aria-hidden="true"
          />
          {segment.text.slice(localOffset)}
        </>
      )
    : segment.text;

  return segment.annotation ? (
    <AnnotationMark annotation={segment.annotation}>{children}</AnnotationMark>
  ) : (
    <span>{children}</span>
  );
});

function AnnotationMark({
  annotation,
  children,
}: {
  annotation: Annotation;
  children: React.ReactNode;
}) {
  const colorClass = {
    important: 'bg-warning/25 decoration-warning',
    question: 'bg-info/20 decoration-info',
    insight: 'bg-success/20 decoration-success',
    todo: 'bg-danger/20 decoration-danger',
  }[annotation.color];

  return (
    <mark
      data-annotation-id={annotation.id}
      className={`${colorClass} rounded-[2px] px-0.5 text-inherit underline-offset-2 ${
        annotation.type === 'note' ? 'underline decoration-dotted' : ''
      }`}
      title={annotation.note}
    >
      {children}
    </mark>
  );
}
