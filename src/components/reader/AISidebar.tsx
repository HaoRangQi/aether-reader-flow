'use client';

/**
 * @fileoverview AISidebar — multi-turn chat panel on the right.
 *
 * Opens when:
 *   - User clicks "深入" on the SelectionPopover (creates a new thread)
 *   - User opens it manually via toolbar (no anchor)
 *
 * Behavior:
 *   - Header shows the anchor text (if any) + close button
 *   - Body shows alternating user/assistant turns + a live streaming bubble
 *   - Footer is an input + send button
 *   - Sends are streamed via AIService.chat()
 *
 * Storage: each completed exchange writes one TimelineEntry (via AIService).
 * The sidebar itself is stateless across page reloads — reopening a thread
 * later means recovering the history from TimelineRepo by `threadId` (P3+).
 */

import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { ModelSwitcher } from '@/components/shared/ModelSwitcher';
import { useReaderStore } from '@/stores/readerStore';
import { useCostStore } from '@/stores/costStore';
import { getAIService } from '@/lib/ai-service-client';
import type { TimelineEntry, ModelRef } from '@/types/domain';
import { X, Send } from 'lucide-react';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** True while assistant is currently streaming this turn. */
  streaming?: boolean;
}

export function AISidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    threadAnchor,
    setThreadAnchor,
    book,
    currentChapter,
  } = useReaderStore();
  const chapter = currentChapter();

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelOverride, setModelOverride] = useState<ModelRef | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset turns when the anchor changes (new thread)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!sidebarOpen) return;
    setTurns([]);
    setInput('');
  }, [sidebarOpen, threadAnchor?.threadId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-scroll to bottom when turns change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  if (!sidebarOpen) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !book || !chapter) return;

    setBusy(true);
    setInput('');
    // Optimistic update: append user turn + empty assistant turn (streaming)
    const newTurns: ChatTurn[] = [
      ...turns,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ];
    setTurns(newTurns);

    try {
      const ai = getAIService();
      const history = newTurns
        .filter(t => !(t.role === 'assistant' && t.streaming))
        .map(t => ({ role: t.role, content: t.content }));

      const r = ai.chat({
        history,
        anchor: threadAnchor
          ? { originalText: threadAnchor.originalText, type: threadAnchor.type }
          : undefined,
        threadId: threadAnchor?.threadId ?? `thread-${crypto.randomUUID()}`,
        bookId: book.id,
        chapterId: chapter.id,
        options: modelOverride ? { modelOverride } : undefined,
      });

      let buffer = '';
      for await (const chunk of r.chunks) {
        if (chunk.type === 'text' && chunk.text) {
          buffer += chunk.text;
          setTurns(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: buffer, streaming: true };
            return next;
          });
        }
        if (chunk.type === 'error') {
          setTurns(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              role: 'assistant',
              content: `[出错] ${chunk.error}`,
              streaming: false,
            };
            return next;
          });
          return;
        }
      }
      await r.done;
      setTurns(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: buffer, streaming: false };
        return next;
      });
      void useCostStore.getState().refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTurns(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: `[出错] ${msg}`,
          streaming: false,
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const close = () => {
    setSidebarOpen(false);
    setThreadAnchor(null);
  };

  return (
    <aside className="w-[420px] shrink-0 h-screen flex flex-col border-l border-divider arf-anim-slide-right">
      <GlassPanel className="flex-1 m-2 flex flex-col rounded-2xl">
        <header className="flex items-start justify-between p-3 border-b border-divider gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-subtle">AI 对话</div>
            {threadAnchor && (
              <div className="text-sm font-serif text-muted mt-1 line-clamp-2 italic">
                「{threadAnchor.originalText}」
              </div>
            )}
            <div className="mt-2">
              <ModelSwitcher
                taskType="chat"
                override={modelOverride}
                onOverride={setModelOverride}
              />
            </div>
          </div>
          <button
            onClick={close}
            className="text-muted hover:text-foreground p-1"
            aria-label="关闭对话"
          >
            <X size={16} />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {turns.length === 0 && !busy && (
            <div className="text-sm text-subtle text-center py-12">
              {threadAnchor
                ? '基于上面的原文继续追问'
                : '问我任何关于这本书的问题'}
            </div>
          )}
          {turns.map((t, i) => (
            <TurnBubble key={i} turn={t} />
          ))}
        </div>

        <footer className="p-3 border-t border-divider">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="追问…"
              rows={2}
              disabled={busy}
              className="flex-1 resize-none bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="self-end bg-accent text-white p-2 rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              aria-label="发送"
            >
              <Send size={16} />
            </button>
          </div>
          <div className="text-xs text-subtle mt-1.5">Enter 发送 · Shift+Enter 换行</div>
        </footer>
      </GlassPanel>
    </aside>
  );
}

function TurnBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap font-serif ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-surface text-foreground border border-divider'
        }`}
      >
        {turn.content || (turn.streaming ? '…' : '')}
      </div>
    </div>
  );
}

// Keep export of types used by the entry registration for P3+ replay.
export type { ChatTurn, TimelineEntry };
