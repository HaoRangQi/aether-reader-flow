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

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { useReaderStore } from '@/stores/readerStore';
import { useCostStore } from '@/stores/costStore';
import { getAIService } from '@/lib/ai-service-client';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import type { ChapterSummary } from '@/types/domain';
import { RefreshCw, X, Sparkles } from 'lucide-react';

/**
 * Parses the AI's Markdown summary into a structured ChapterSummary.
 * Best-effort — falls back to a single-string summary if structure misses.
 */
function parseStructuredSummary(text: string, modelUsed: string): ChapterSummary {
  const sectionPattern = (header: string) =>
    new RegExp(`##\\s*${header}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);

  const corePoints = extractList(text.match(sectionPattern('核心论点'))?.[1] ?? '');
  const keyConcepts = extractList(text.match(sectionPattern('关键概念'))?.[1] ?? '');
  const argumentFlow = (text.match(sectionPattern('论证逻辑'))?.[1] ?? '').trim();
  const openQuestions = extractList(text.match(sectionPattern('章末思考'))?.[1] ?? '');

  return {
    corePoints: corePoints.length ? corePoints : [text.slice(0, 500)],
    keyConcepts,
    argumentFlow,
    openQuestions,
    generatedAt: new Date(),
    modelUsed,
  };
}

function extractList(blob: string): string[] {
  return blob
    .split('\n')
    .map(l => l.replace(/^\s*[-*\d.]+\s*/, '').trim())
    .filter(l => l.length > 0);
}

export function ChapterSummaryPanel() {
  const { summaryOpen, setSummaryOpen, book, currentChapter } = useReaderStore();
  const chapter = currentChapter();
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset & hydrate from cache when chapter changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSummary(null);
    setStreamingText('');
    setError(null);
    if (chapter?.summaryCache) {
      setSummary(chapter.summaryCache);
    }
  }, [chapter?.id, chapter?.summaryCache]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!summaryOpen || !book || !chapter) return null;

  const generate = async (force = false) => {
    if (busy) return;
    if (!force && summary) return;

    setBusy(true);
    setError(null);
    setSummary(null);
    setStreamingText('');

    try {
      const ai = getAIService();
      const r = ai.summarize({
        chapterTitle: chapter.title,
        chapterContent: chapter.content.slice(0, 30_000),
        bookId: book.id,
        chapterId: chapter.id,
      });

      let buffer = '';
      for await (const chunk of r.chunks) {
        if (chunk.type === 'text' && chunk.text) {
          buffer += chunk.text;
          setStreamingText(buffer);
        }
        if (chunk.type === 'error') {
          setError(chunk.error ?? 'unknown');
          return;
        }
      }
      const entry = await r.done;
      const parsed = parseStructuredSummary(buffer, entry.aiModel);
      setSummary(parsed);
      setStreamingText('');

      // Cache on the chapter row so reopening doesn't re-run
      await new IndexedDBChapterRepo().update(chapter.id, { summaryCache: parsed });
      void useCostStore.getState().refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel className="mb-6 p-5">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="text-sm font-serif text-foreground">章节总结</span>
          {summary && (
            <span className="text-xs text-subtle">
              · {summary.modelUsed} · {new Date(summary.generatedAt).toLocaleString('zh-CN')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        <div className="text-sm font-serif whitespace-pre-wrap text-foreground">
          {streamingText || '正在生成…'}
        </div>
      )}

      {error && <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>}

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
