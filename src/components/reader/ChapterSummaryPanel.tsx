'use client';

/**
 * @fileoverview ChapterSummaryPanel — collapsible panel above the chapter
 * content. Generates and caches a structured summary for the current chapter.
 *
 * Caching strategy:
 *   - First time → call /api/ai/summarize, stream into the panel, then
 *     persist on the `Chapter.summaryCache` field via `ChapterRepo.update`.
 *   - Subsequent opens of the same chapter → render from cache instantly.
 *   - "重新生成" button bypasses the cache and re-runs.
 */

import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { useReaderStore } from '@/stores/readerStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useCostStore } from '@/stores/costStore';
import { getAIService } from '@/lib/ai-service-client';
import { normalizeChapterSummary, parseChapterSummary } from '@/lib/chapter-summary';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import type { Annotation, ChapterSummary, TimelineEntry, TaskType } from '@/types/domain';
import {
  Clock,
  Highlighter,
  RefreshCw,
  RotateCcw,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';

const TASK_LABEL: Record<TaskType, string> = {
  translate: '翻译',
  explain: '解释',
  verify: '验证',
  summarize: '总结',
  chat: '对话',
};

const COLOR_LABEL: Record<Annotation['color'], string> = {
  important: '重要',
  question: '疑问',
  insight: '精彩',
  todo: '待查',
};

function formatTime(d: Date): string {
  return new Date(d).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChapterSummaryPanel() {
  const { summaryOpen, setSummaryOpen, book, currentChapter, jumpToAnchor } = useReaderStore();
  const chapter = currentChapter();
  const annotations = useAnnotationStore(s =>
    chapter ? (s.byChapter[chapter.id] ?? []) : [],
  );
  const loadAnnotations = useAnnotationStore(s => s.loadChapter);
  const deleteAnnotation = useAnnotationStore(s => s.delete);
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRetryable, setErrorRetryable] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const runIdRef = useRef(0);
  const cancelRef = useRef<{ runId: number; cancel: () => void } | null>(null);

  // Reset & hydrate from cache when chapter changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSummary(null);
    setStreamingText('');
    setError(null);
    setErrorRetryable(false);
    setCacheError(null);
    const cached = normalizeChapterSummary(chapter?.summaryCache);
    if (cached) setSummary(cached);
  }, [chapter?.id, chapter?.summaryCache]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!summaryOpen || !chapter) return;
    const chapterId = chapter.id;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTimelineEntries([]);
    setTimelineError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void loadAnnotations(chapterId);
    (async () => {
      try {
        const entries = await new IndexedDBTimelineRepo().listByChapter(chapterId);
        if (cancelled) return;
        setTimelineEntries(
          entries.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
        );
      } catch (e) {
        if (cancelled) return;
        setTimelineError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryOpen, chapter, loadAnnotations]);

  if (!summaryOpen || !book || !chapter) return null;

  const generate = async (force = false) => {
    if (busyRef.current) return;
    if (!force && summary) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setErrorRetryable(false);
    setCacheError(null);
    setSummary(null);
    setStreamingText('');

    const isCurrentRun = () => runIdRef.current === runId;

    try {
      const ai = getAIService();
      const r = ai.summarize({
        chapterTitle: chapter.title,
        chapterContent: chapter.content.slice(0, 30_000),
        bookId: book.id,
        chapterId: chapter.id,
        options: { timeoutMs: 180_000 },
      });
      cancelRef.current = { runId, cancel: r.cancel };

      let buffer = '';
      for await (const chunk of r.chunks) {
        if (!isCurrentRun()) return;
        if (chunk.type === 'text' && chunk.text) {
          buffer += chunk.text;
          setStreamingText(buffer);
        }
        if (chunk.type === 'error') {
          if (cancelRef.current?.runId === runId) cancelRef.current = null;
          void r.done.catch(() => undefined);
          setError(chunk.error ?? 'unknown');
          setErrorRetryable(Boolean(chunk.retryable));
          return;
        }
      }
      const entry = await r.done;
      if (!isCurrentRun()) return;
      if (cancelRef.current?.runId === runId) cancelRef.current = null;
      const parsed = parseChapterSummary(buffer, {
        generatedAt: entry.timestamp,
        modelUsed: entry.aiModel,
      });
      setSummary(parsed);
      setStreamingText('');

      // Cache on the chapter row so reopening doesn't re-run
      try {
        await new IndexedDBChapterRepo().update(chapter.id, { summaryCache: parsed });
        if (!isCurrentRun()) return;
        useReaderStore.setState(state => ({
          chapters: state.chapters.map(item =>
            item.id === chapter.id ? { ...item, summaryCache: parsed } : item,
          ),
        }));
      } catch (e) {
        if (!isCurrentRun()) return;
        setCacheError(
          `总结已生成，但缓存保存失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
      void useCostStore.getState().refresh();
    } catch (e) {
      if (!isCurrentRun()) return;
      if (cancelRef.current?.runId === runId) cancelRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
      setErrorRetryable(false);
    } finally {
      if (isCurrentRun()) {
        cancelRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const cancel = () => {
    const active = cancelRef.current;
    active?.cancel();
    if (active) runIdRef.current = Math.max(runIdRef.current, active.runId + 1);
    cancelRef.current = null;
    busyRef.current = false;
    setBusy(false);
    setError('已停止生成');
    setErrorRetryable(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-20 md:items-center md:pt-4">
      <GlassPanel className="max-h-[calc(100vh-6rem)] w-full max-w-4xl overflow-y-auto p-5 md:max-h-[86vh]">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="text-sm font-serif text-foreground">本章理解</span>
          {summary && (
            <span className="text-xs text-subtle">
              · {summary.modelUsed} · {new Date(summary.generatedAt).toLocaleString('zh-CN')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <button
              onClick={cancel}
              className="text-muted hover:text-foreground p-1"
              aria-label="停止生成"
              title="停止生成"
            >
              <X size={14} />
            </button>
          )}
          {summary && (
            <button
              onClick={() => generate(true)}
              disabled={busy}
              className="text-muted hover:text-foreground p-1 disabled:opacity-50"
              aria-label="重新生成"
              title="重新生成"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            onClick={() => setSummaryOpen(false)}
            className="text-muted hover:text-foreground p-1"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {!summary && !busy && !streamingText && !error && (
        <button
          onClick={() => generate(false)}
          className="text-sm bg-accent text-white px-4 py-2 rounded-md hover:bg-[var(--color-accent-hover)]"
        >
          生成本章总结
        </button>
      )}

      {(busy || streamingText) && (
        <div
          className="text-sm font-serif whitespace-pre-wrap text-foreground"
          role="status"
          aria-live="polite"
        >
          {streamingText || '正在生成…'}
        </div>
      )}

      {error && (
        <div className="mb-4 space-y-2" role="alert">
          <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>
          {errorRetryable && (
            <button
              type="button"
              onClick={() => generate(true)}
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              <RotateCcw size={12} />
              重试
            </button>
          )}
        </div>
      )}

      {cacheError && (
        <div className="mb-4 text-sm text-danger whitespace-pre-wrap" role="alert">
          {cacheError}
        </div>
      )}

      {(annotations.length > 0 || timelineEntries.length > 0 || timelineError) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <InsightBlock
            icon={<Highlighter size={14} />}
            title={`批注与高亮 · ${annotations.length}`}
            empty="本章还没有高亮或笔记"
            count={annotations.length}
          >
            <div className="space-y-2">
              {annotations.slice(0, 8).map(a => (
                <AnnotationRow
                  key={a.id}
                  annotation={a}
                  onJump={() =>
                    jumpToAnchor({
                      chapterId: a.chapterId,
                      text: a.anchor.quote,
                      start: a.anchor.start,
                      end: a.anchor.end,
                      page: a.anchor.page,
                    })
                  }
                  onDelete={() => void deleteAnnotation(a.id, a.chapterId)}
                />
              ))}
            </div>
          </InsightBlock>

          <InsightBlock
            icon={<Clock size={14} />}
            title={`AI 活动 · ${timelineEntries.length}`}
            empty="本章还没有 AI 交互"
            count={timelineEntries.length + (timelineError ? 1 : 0)}
          >
            {timelineError && (
              <div className="mb-2 text-xs text-danger" role="alert">
                AI 活动加载失败：{timelineError}
              </div>
            )}
            <div className="space-y-2">
              {timelineEntries.slice(0, 8).map(e => (
                <TimelineRow
                  key={e.id}
                  entry={e}
                  onJump={() =>
                    e.originalText
                      ? jumpToAnchor({
                          chapterId: e.chapterId,
                          text: e.originalText,
                          start: e.anchor?.start,
                          end: e.anchor?.end,
                          page: e.anchor?.page ?? e.page,
                        })
                      : undefined
                  }
                />
              ))}
            </div>
          </InsightBlock>
        </div>
      )}

      {summary && !streamingText && (
        <div className="space-y-4 text-sm font-serif text-foreground">
          {summary.corePoints.length > 0 && (
            <Section title="核心论点">
              <ul className="list-disc list-inside space-y-1">
                {summary.corePoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Section>
          )}
          {summary.keyConcepts.length > 0 && (
            <Section title="关键概念">
              <ul className="list-disc list-inside space-y-1">
                {summary.keyConcepts.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Section>
          )}
          {summary.argumentFlow && (
            <Section title="论证逻辑">
              <p className="whitespace-pre-wrap">{summary.argumentFlow}</p>
            </Section>
          )}
          {summary.openQuestions.length > 0 && (
            <Section title="章末思考">
              <ul className="list-disc list-inside space-y-1">
                {summary.openQuestions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
      </GlassPanel>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-subtle mb-1.5 font-sans">{title}</div>
      {children}
    </div>
  );
}

function InsightBlock({
  icon,
  title,
  empty,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-divider bg-surface/50 p-3">
      <div className="flex items-center gap-2 text-xs text-subtle mb-2">
        {icon}
        <span>{title}</span>
      </div>
      {count > 0 ? children : <div className="text-xs text-subtle">{empty}</div>}
    </section>
  );
}

function AnnotationRow({
  annotation,
  onJump,
  onDelete,
}: {
  annotation: Annotation;
  onJump: () => void;
  onDelete: () => void;
}) {
  const isNote = annotation.type === 'note';
  return (
    <div className="group rounded border border-divider/60 bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={onJump}
          className="flex min-w-0 items-center gap-1.5 text-left text-xs text-accent hover:underline"
        >
          {isNote ? <StickyNote size={12} /> : <Highlighter size={12} />}
          <span>{isNote ? '笔记' : '高亮'} · {COLOR_LABEL[annotation.color]}</span>
          <span className="text-subtle">#{annotation.anchor.start}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-subtle hover:text-danger transition"
          aria-label="删除批注"
          title="删除批注"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <button
        type="button"
        onClick={onJump}
        className="block w-full text-left font-serif text-sm text-muted line-clamp-2 hover:text-foreground"
      >
        {annotation.anchor.quote}
      </button>
      {annotation.note && (
        <div className="mt-1 text-xs text-foreground whitespace-pre-wrap line-clamp-2">
          {annotation.note}
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  entry,
  onJump,
}: {
  entry: TimelineEntry;
  onJump: (() => void) | undefined;
}) {
  const content = entry.originalText || entry.userInput || entry.aiResponse;
  return (
    <div className="rounded border border-divider/60 bg-surface px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-subtle mb-1">
        <span className="text-accent">{TASK_LABEL[entry.type]}</span>
        <span>{formatTime(entry.timestamp)}</span>
      </div>
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          className="block w-full text-left font-serif text-sm text-muted line-clamp-2 hover:text-foreground"
        >
          {content}
        </button>
      ) : (
        <div className="font-serif text-sm text-muted line-clamp-2">{content}</div>
      )}
    </div>
  );
}
