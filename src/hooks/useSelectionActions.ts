'use client';

import { useRef, useState, useCallback } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { useCostStore } from '@/stores/costStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { getAIService } from '@/lib/ai-service-client';

type InlineTaskType = 'translate' | 'explain' | 'verify';
const INLINE_TASK_TYPES: readonly InlineTaskType[] = ['translate', 'explain', 'verify'];

export interface InlineResult {
  type: InlineTaskType;
  text: string;
  streaming: boolean;
  error?: string;
  retryable?: boolean;
}

function contextAround(content: string, start: number, end: number): string {
  const radius = 750;
  const from = Math.max(0, start - radius);
  const to = Math.min(content.length, end + radius);
  return content.slice(from, to);
}

function isInlineTaskType(value: unknown): value is InlineTaskType {
  return typeof value === 'string' && INLINE_TASK_TYPES.includes(value as InlineTaskType);
}

export function useSelectionActions() {
  const { selection, currentChapter, book, setSelection, setSidebarOpen, setThreadAnchor } =
    useReaderStore();
  const setTimelineOpen = useTimelineStore(s => s.setPanelOpen);
  const createAnnotation = useAnnotationStore(s => s.create);
  const chapter = currentChapter();
  const [result, setResult] = useState<InlineResult | null>(null);
  const runIdRef = useRef(0);
  const cancelRef = useRef<{ runId: number; cancel: () => void } | null>(null);

  const runInline = useCallback(
    async (type: InlineTaskType) => {
      if (!isInlineTaskType(type)) return;
      if (!selection || !chapter || !book) return;
      cancelRef.current?.cancel();
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      setResult({ type, text: '', streaming: true });
      const isCurrentRun = () => runIdRef.current === runId;
      const ai = getAIService();
      try {
        const ctx = contextAround(chapter.content, selection.start, selection.end);
        const anchor = { start: selection.start, end: selection.end, page: selection.page };
        const r =
          type === 'translate'
            ? ai.translate({
                text: selection.text,
                bookId: book.id,
                chapterId: chapter.id,
                anchor,
                options: { timeoutMs: 120_000 },
              })
            : type === 'explain'
              ? ai.explain({
                  text: selection.text,
                  context: ctx,
                  bookId: book.id,
                  chapterId: chapter.id,
                  anchor,
                  options: { timeoutMs: 120_000 },
                })
              : ai.verify({
                  text: selection.text,
                  context: ctx,
                  bookId: book.id,
                  chapterId: chapter.id,
                  anchor,
                  options: { timeoutMs: 180_000 },
                });
        cancelRef.current = { runId, cancel: r.cancel };

        let buffer = '';
        for await (const chunk of r.chunks) {
          if (!isCurrentRun()) return;
          if (chunk.type === 'text' && chunk.text) {
            buffer += chunk.text;
            setResult({ type, text: buffer, streaming: true });
          }
          if (chunk.type === 'error') {
            if (cancelRef.current?.runId === runId) cancelRef.current = null;
            void r.done.catch(() => undefined);
            setResult({
              type,
              text: buffer,
              streaming: false,
              error: chunk.error,
              retryable: chunk.retryable,
            });
            return;
          }
        }
        await r.done;
        if (!isCurrentRun()) return;
        setResult({ type, text: buffer, streaming: false });
        if (cancelRef.current?.runId === runId) cancelRef.current = null;
        void useCostStore.getState().refresh();
      } catch (e) {
        if (!isCurrentRun()) return;
        if (cancelRef.current?.runId === runId) cancelRef.current = null;
        setResult({
          type,
          text: '',
          streaming: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [selection, chapter, book],
  );

  const openDeep = useCallback(() => {
    if (!selection) return;
    setThreadAnchor({
      threadId: `thread-${crypto.randomUUID()}`,
      originalText: selection.text,
      type: 'chat',
    });
    setTimelineOpen(false);
    setSidebarOpen(true);
    setSelection(null);
  }, [selection, setThreadAnchor, setTimelineOpen, setSidebarOpen, setSelection]);

  const close = useCallback(() => {
    const active = cancelRef.current;
    active?.cancel();
    if (active) runIdRef.current = Math.max(runIdRef.current, active.runId + 1);
    cancelRef.current = null;
    setSelection(null);
    setResult(null);
  }, [setSelection]);

  const clearResult = useCallback(() => {
    const active = cancelRef.current;
    active?.cancel();
    if (active) runIdRef.current = Math.max(runIdRef.current, active.runId + 1);
    cancelRef.current = null;
    setResult(null);
  }, []);

  const cancelInline = useCallback(() => {
    const active = cancelRef.current;
    active?.cancel();
    if (active) runIdRef.current = Math.max(runIdRef.current, active.runId + 1);
    cancelRef.current = null;
    setResult(prev =>
      prev ? { ...prev, streaming: false, error: '已停止生成' } : prev,
    );
  }, []);

  const createHighlight = useCallback(async () => {
    if (!selection || !chapter || !book) return;
    await createAnnotation({
      bookId: book.id,
      chapterId: chapter.id,
      type: 'highlight',
      color: 'important',
      anchor: {
        start: selection.start,
        end: selection.end,
        quote: selection.text,
        page: selection.page,
      },
    });
    setSelection(null);
  }, [selection, chapter, book, createAnnotation, setSelection]);

  const createNote = useCallback(async (note: string) => {
    if (!selection || !chapter || !book) return;
    await createAnnotation({
      bookId: book.id,
      chapterId: chapter.id,
      type: 'note',
      color: 'question',
      note: note.trim() || undefined,
      anchor: {
        start: selection.start,
        end: selection.end,
        quote: selection.text,
        page: selection.page,
      },
    });
    setSelection(null);
  }, [selection, chapter, book, createAnnotation, setSelection]);

  return {
    result,
    runInline,
    openDeep,
    createHighlight,
    createNote,
    cancelInline,
    close,
    clearResult,
  };
}
