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
import { timelineEntriesToChatTurns } from '@/lib/chat-thread-replay';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import type { TimelineEntry, ModelRef } from '@/types/domain';
import { X, Send, RotateCcw } from 'lucide-react';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** True while assistant is currently streaming this turn. */
  streaming?: boolean;
  /** Marks a failed assistant turn so it is excluded from future request history. */
  error?: boolean;
  retryable?: boolean;
  retryInput?: string;
}

type ChatHistoryTurn = Pick<ChatTurn, 'role' | 'content'>;

function buildRequestHistory(turns: ChatTurn[], currentInput: string): ChatHistoryTurn[] {
  const history: ChatHistoryTurn[] = [];
  let pendingUser: ChatHistoryTurn | null = null;

  for (const turn of turns) {
    if (turn.role === 'user') {
      pendingUser = { role: 'user', content: turn.content };
      continue;
    }

    if (turn.streaming || turn.error || !pendingUser) {
      pendingUser = null;
      continue;
    }

    history.push(pendingUser, { role: 'assistant', content: turn.content });
    pendingUser = null;
  }

  history.push({ role: 'user', content: currentInput });
  return history;
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
  const [manualThreadId, setManualThreadId] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<ModelRef | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const chatRequestRef = useRef(0);
  const restoreRequestRef = useRef(0);

  // Restore turns when opening an existing thread; otherwise start fresh.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!sidebarOpen) return;
    chatRequestRef.current += 1;
    restoreRequestRef.current += 1;
    const restoreRequestId = restoreRequestRef.current;
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(false);
    setInput('');
    setManualThreadId(null);
    setTurns([]);
    setRestoreError(null);
    if (!threadAnchor?.threadId || !book) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    setRestoring(true);
    (async () => {
      try {
        const entries = await new IndexedDBTimelineRepo().listByBook(book.id);
        if (cancelled || restoreRequestRef.current !== restoreRequestId) return;
        const restored = timelineEntriesToChatTurns(entries, threadAnchor.threadId);
        setTurns(restored);
        setRestoreError(null);
      } catch (error) {
        if (cancelled || restoreRequestRef.current !== restoreRequestId) return;
        const message = error instanceof Error ? error.message : String(error);
        setRestoreError(`对话恢复失败：${message}`);
      } finally {
        if (!cancelled && restoreRequestRef.current === restoreRequestId) {
          setRestoring(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sidebarOpen, threadAnchor?.threadId, book]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-scroll to bottom when turns change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  if (!sidebarOpen) return null;

  const sendMessage = async (text: string, baseTurns = turns) => {
    if (!text || busy || restoring || !book || !chapter) return;

    const requestId = chatRequestRef.current + 1;
    chatRequestRef.current = requestId;
    setBusy(true);
    setInput('');
    // Optimistic update: append user turn + empty assistant turn (streaming)
    const newTurns: ChatTurn[] = [
      ...baseTurns,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ];
    setTurns(newTurns);

    try {
      const ai = getAIService();
      const threadId =
        threadAnchor?.threadId ??
        manualThreadId ??
        `thread-${crypto.randomUUID()}`;
      if (!threadAnchor && !manualThreadId) setManualThreadId(threadId);
      const history = buildRequestHistory(baseTurns, text);

      const r = ai.chat({
        history,
        anchor: threadAnchor
          ? { originalText: threadAnchor.originalText, type: threadAnchor.type }
          : undefined,
        threadId,
        bookId: book.id,
        chapterId: chapter.id,
        options: {
          ...(modelOverride ? { modelOverride } : {}),
          timeoutMs: 180_000,
        },
      });
      cancelRef.current = r.cancel;

      let buffer = '';
      for await (const chunk of r.chunks) {
        if (chatRequestRef.current !== requestId) return;
        if (chunk.type === 'text' && chunk.text) {
          buffer += chunk.text;
          setTurns(prev => {
            if (chatRequestRef.current !== requestId) return prev;
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: buffer, streaming: true };
            return next;
          });
        }
        if (chunk.type === 'error') {
          cancelRef.current = null;
          void r.done.catch(() => undefined);
          setTurns(prev => {
            if (chatRequestRef.current !== requestId) return prev;
            const next = [...prev];
            next[next.length - 1] = {
              role: 'assistant',
              content: chunk.error ?? 'AI 请求失败。请稍后重试。',
              streaming: false,
              error: true,
              retryable: chunk.retryable,
              retryInput: text,
            };
            return next;
          });
          return;
        }
      }
      await r.done;
      if (chatRequestRef.current !== requestId) return;
      cancelRef.current = null;
      setTurns(prev => {
        if (chatRequestRef.current !== requestId) return prev;
        const next = [...prev];
        next[next.length - 1] = buffer.trim()
          ? { role: 'assistant', content: buffer, streaming: false }
          : {
              role: 'assistant',
              content: 'AI 没有返回内容。请重试。',
              streaming: false,
              error: true,
              retryable: true,
              retryInput: text,
            };
        return next;
      });
      void useCostStore.getState().refresh();
    } catch (e) {
      cancelRef.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      setTurns(prev => {
        if (chatRequestRef.current !== requestId) return prev;
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: msg,
          streaming: false,
          error: true,
          retryable: false,
          retryInput: text,
        };
        return next;
      });
    } finally {
      if (chatRequestRef.current === requestId) {
        cancelRef.current = null;
        setBusy(false);
      }
    }
  };

  const send = async () => {
    const text = input.trim();
    await sendMessage(text);
  };

  const retryTurn = async (index: number) => {
    if (busy || restoring) return;
    const failedTurn = turns[index];
    const userTurn = turns[index - 1];
    const text = failedTurn?.retryInput ?? (userTurn?.role === 'user' ? userTurn.content : '');
    if (!text) return;
    await sendMessage(text, turns.slice(0, Math.max(0, index - 1)));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const close = () => {
    chatRequestRef.current += 1;
    restoreRequestRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    setSidebarOpen(false);
    setThreadAnchor(null);
    setManualThreadId(null);
    setBusy(false);
    setRestoring(false);
    setRestoreError(null);
  };

  const startNewConversation = () => {
    chatRequestRef.current += 1;
    restoreRequestRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    setThreadAnchor(null);
    setManualThreadId(null);
    setTurns([]);
    setInput('');
    setBusy(false);
    setRestoring(false);
    setRestoreError(null);
  };

  const cancel = () => {
    chatRequestRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(false);
    setTurns(prev => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        next[next.length - 1] = {
          role: 'assistant',
          content: last.content || '[已停止生成]',
          streaming: false,
          error: true,
          retryable: false,
        };
      }
      return next;
    });
  };

  return (
    <aside className="fixed inset-0 z-40 flex h-screen w-full min-h-0 flex-col border-l border-divider arf-anim-slide-right md:static md:w-[420px] md:shrink-0">
      <GlassPanel className="m-2 flex min-h-0 flex-1 flex-col rounded-2xl">
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
          <div className="flex items-center gap-1">
            <button
              onClick={startNewConversation}
              className="text-muted hover:text-foreground p-1"
              aria-label="新开会话"
              title="新开会话"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={close}
              className="text-muted hover:text-foreground p-1"
              aria-label="关闭对话"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3 overscroll-contain">
          {restoring && (
            <div className="text-sm text-subtle text-center py-12">正在恢复对话…</div>
          )}
          {restoreError && (
            <div className="text-sm text-danger text-center py-4" role="alert">
              {restoreError}
            </div>
          )}
          {turns.length === 0 && !busy && !restoring && !restoreError && (
            <div className="text-sm text-subtle text-center py-12">
              {threadAnchor
                ? '基于上面的原文继续追问'
                : '问我任何关于这本书的问题'}
            </div>
          )}
          {turns.map((t, i) => (
            <TurnBubble key={i} turn={t} onRetry={() => retryTurn(i)} />
          ))}
        </div>

        <footer className="p-3 border-t border-divider">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="追问…"
              rows={3}
              disabled={busy || restoring}
              className="flex-1 min-h-[72px] max-h-[240px] resize-y bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <button
              onClick={busy ? cancel : send}
              disabled={restoring || (!busy && !input.trim())}
              className="self-end bg-accent text-white p-2 rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              aria-label={busy ? '停止生成' : '发送'}
            >
              {busy ? <X size={16} /> : <Send size={16} />}
            </button>
          </div>
          <div className="text-xs text-subtle mt-1.5">Enter 发送 · Shift+Enter 换行</div>
        </footer>
      </GlassPanel>
    </aside>
  );
}

function TurnBubble({ turn, onRetry }: { turn: ChatTurn; onRetry: () => void }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        role={turn.error ? 'alert' : undefined}
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap font-serif ${
          isUser
            ? 'bg-accent text-white'
            : turn.error
              ? 'bg-danger/10 text-danger border border-danger/30'
              : 'bg-surface text-foreground border border-divider'
        }`}
      >
        {turn.content || (turn.streaming ? '…' : '')}
        {turn.error && turn.retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <RotateCcw size={12} />
            重试
          </button>
        )}
      </div>
    </div>
  );
}

// Keep export of types used by the entry registration for P3+ replay.
export type { ChatTurn, TimelineEntry };
