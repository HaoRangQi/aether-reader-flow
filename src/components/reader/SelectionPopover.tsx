'use client';

/**
 * @fileoverview SelectionPopover — appears above a text selection in the
 * reader, offers 4 quick actions: 翻译 / 解释 / 验证 / 深入。
 *
 * Behavior:
 *   - Pops up at the bounding rect of the current selection.
 *   - 翻译 / 解释 / 验证 → run inline; show the streaming answer inside the popover.
 *   - 深入 → open the AI sidebar with a new thread anchored on the selection.
 *
 * For minimum scope we render the result inline with markdown-as-text
 * (no formatter). P5 will swap in a real Markdown renderer.
 */

import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { useReaderStore } from '@/stores/readerStore';
import { getAIService } from '@/lib/ai-service-client';
import type { TaskType } from '@/types/domain';
import { Globe, MessageSquare, Languages, BookOpen, X } from 'lucide-react';

interface PopoverPosition {
  top: number;
  left: number;
}

interface InlineResult {
  type: TaskType;
  text: string;
  /** True while streaming; false once `done` resolved. */
  streaming: boolean;
  error?: string;
}

/**
 * Extracts a windowed context around the selection within the chapter
 * content for the explain/verify prompts. ~1500 chars total.
 */
function contextAround(content: string, start: number, end: number): string {
  const radius = 750;
  const from = Math.max(0, start - radius);
  const to = Math.min(content.length, end + radius);
  return content.slice(from, to);
}

export function SelectionPopover() {
  const { selection, currentChapter, book, setSelection, setSidebarOpen, setThreadAnchor } =
    useReaderStore();
  const chapter = currentChapter();
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [result, setResult] = useState<InlineResult | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position based on current window selection
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selection) {
      setPosition(null);
      setResult(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    setPosition({
      top: rect.top + window.scrollY - 12,
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, [selection]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Click-outside to dismiss (but not on the popover itself)
  useEffect(() => {
    if (!position) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Only dismiss if there's no result being displayed; otherwise let user read it
        if (!result) {
          setSelection(null);
        }
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [position, result, setSelection]);

  if (!selection || !position || !chapter || !book) return null;

  const runInline = async (type: 'translate' | 'explain' | 'verify') => {
    setResult({ type, text: '', streaming: true });
    const ai = getAIService();
    try {
      const ctx = contextAround(chapter.content, selection.start, selection.end);
      const r =
        type === 'translate'
          ? ai.translate({ text: selection.text, bookId: book.id, chapterId: chapter.id })
          : type === 'explain'
            ? ai.explain({
                text: selection.text,
                context: ctx,
                bookId: book.id,
                chapterId: chapter.id,
              })
            : ai.verify({
                text: selection.text,
                context: ctx,
                bookId: book.id,
                chapterId: chapter.id,
              });

      let buffer = '';
      for await (const chunk of r.chunks) {
        if (chunk.type === 'text' && chunk.text) {
          buffer += chunk.text;
          setResult({ type, text: buffer, streaming: true });
        }
        if (chunk.type === 'error') {
          setResult({ type, text: buffer, streaming: false, error: chunk.error });
          return;
        }
      }
      await r.done;
      setResult({ type, text: buffer, streaming: false });
    } catch (e) {
      setResult({
        type,
        text: '',
        streaming: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const openDeep = () => {
    setThreadAnchor({
      threadId: `thread-${crypto.randomUUID()}`,
      originalText: selection.text,
      type: 'chat',
    });
    setSidebarOpen(true);
  };

  const close = () => {
    setSelection(null);
    setResult(null);
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-40"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <GlassPanel className="p-1">
        {!result && (
          <div className="flex items-center gap-0">
            <ActionButton onClick={() => runInline('translate')} icon={<Languages size={14} />}>
              翻译
            </ActionButton>
            <ActionButton onClick={() => runInline('explain')} icon={<BookOpen size={14} />}>
              解释
            </ActionButton>
            <ActionButton onClick={() => runInline('verify')} icon={<Globe size={14} />}>
              验证
            </ActionButton>
            <ActionButton onClick={openDeep} icon={<MessageSquare size={14} />}>
              深入
            </ActionButton>
          </div>
        )}
        {result && (
          <div className="w-[400px] max-h-[320px] overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-subtle">
                {result.type === 'translate' ? '翻译' : result.type === 'explain' ? '解释' : '验证'}
                {result.streaming && ' · 生成中…'}
              </span>
              <button
                onClick={close}
                className="text-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </div>
            {result.error ? (
              <div className="text-sm text-danger whitespace-pre-wrap">{result.error}</div>
            ) : (
              <div className="text-sm text-foreground whitespace-pre-wrap font-serif">
                {result.text || '…'}
              </div>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-foreground hover:bg-[var(--color-glass-glow)] rounded-lg transition"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
