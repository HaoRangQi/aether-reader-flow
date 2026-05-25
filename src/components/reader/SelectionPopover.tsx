'use client';

import { useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useConfigStore } from '@/stores/configStore';
import { useSelectionActions } from '@/hooks/useSelectionActions';
import { SelectionNoteForm } from './SelectionNoteForm';
import { Globe, MessageSquare, Languages, BookOpen, X, Highlighter, StickyNote, RotateCcw } from 'lucide-react';

interface PopoverPosition {
  top: number;
  left: number;
}

const RESULT_WIDTH = {
  compact: 'w-[280px]',
  normal: 'w-[400px]',
  wide: 'w-[560px]',
};

export function SelectionPopover() {
  const { selection, setSelection } = useReaderStore();
  const selectionPrefs = useConfigStore(s => s.selectionPrefs);
  const { result, runInline, openDeep, createHighlight, createNote, cancelInline, close } = useSelectionActions();
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'highlight' | 'note' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    if (!selection) {
      raf = requestAnimationFrame(() => setPosition(null));
      return () => cancelAnimationFrame(raf);
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    raf = requestAnimationFrame(() => {
      setPosition({
        top: rect.top + window.scrollY - 12,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [selection]);

  useEffect(() => {
    if (!position) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (!result) setSelection(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [position, result, setSelection]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const widthClass = RESULT_WIDTH[selectionPrefs.resultWidth];

  const announceActionStatus = (message: string) => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    setActionStatus(message);
    statusTimerRef.current = window.setTimeout(() => {
      setActionStatus(null);
      statusTimerRef.current = null;
    }, 3000);
  };

  const handleInline = (type: 'translate' | 'explain' | 'verify') => {
    setActionError(null);
    setActionStatus(null);
    setNoteOpen(false);
    void runInline(type);
  };

  const handleOpenDeep = () => {
    setActionError(null);
    setActionStatus(null);
    setNoteOpen(false);
    openDeep();
  };

  const handleAnnotationAction = async (
    type: 'highlight' | 'note',
    action: () => Promise<void>,
  ) => {
    setActionError(null);
    setActionStatus(null);
    setPendingAction(type);
    try {
      await action();
      if (useReaderStore.getState().selection === null) {
        announceActionStatus(type === 'highlight' ? '高亮已创建' : '笔记已创建');
      }
    } catch (error) {
      const label = type === 'highlight' ? '高亮' : '笔记';
      setActionError(`${label}创建失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPendingAction(null);
    }
  };

  const openNoteForm = () => {
    setActionError(null);
    setActionStatus(null);
    setNoteDraft('');
    setNoteOpen(true);
  };

  const submitNote = () => {
    void handleAnnotationAction('note', () => createNote(noteDraft));
  };

  if (!selection || !position) {
    return !selection && actionStatus ? (
      <div className="sr-only" role="status" aria-live="polite">
        {actionStatus}
      </div>
    ) : null;
  }

  return (
    <>
      <div
        ref={popoverRef}
        className="fixed z-40 arf-anim-popover"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: 'translate(-50%, -100%)',
        }}
      >
        <div
          className="rounded-2xl border backdrop-blur-xl backdrop-saturate-150 shadow-lg"
          style={{
            backgroundColor: 'var(--color-bubble-bg)',
            borderColor: 'var(--color-glass-border)',
            color: 'var(--color-bubble-text)',
          }}
        >
          {!result && noteOpen && (
            <div>
              <SelectionNoteForm
                value={noteDraft}
                onChange={setNoteDraft}
                onCancel={() => setNoteOpen(false)}
                onSubmit={submitNote}
                disabled={pendingAction !== null}
              />
              {actionError && (
                <div className="px-3 pb-2 text-xs text-danger" role="alert">
                  {actionError}
                </div>
              )}
            </div>
          )}
          {!result && !noteOpen && (
            <div>
              <div className="flex items-center gap-0 p-1">
                <BubbleButton onClick={() => handleInline('translate')} icon={<Languages size={14} />}>
                  翻译
                </BubbleButton>
                <BubbleButton onClick={() => handleInline('explain')} icon={<BookOpen size={14} />}>
                  解释
                </BubbleButton>
                <BubbleButton onClick={() => handleInline('verify')} icon={<Globe size={14} />}>
                  验证
                </BubbleButton>
                <BubbleButton onClick={handleOpenDeep} icon={<MessageSquare size={14} />}>
                  深入
                </BubbleButton>
                <BubbleButton
                  onClick={() => { void handleAnnotationAction('highlight', createHighlight); }}
                  disabled={pendingAction !== null}
                  icon={<Highlighter size={14} />}
                >
                  {pendingAction === 'highlight' ? '保存中…' : '高亮'}
                </BubbleButton>
                <BubbleButton
                  onClick={openNoteForm}
                  disabled={pendingAction !== null}
                  icon={<StickyNote size={14} />}
                >
                  {pendingAction === 'note' ? '保存中…' : '笔记'}
                </BubbleButton>
              </div>
              {actionError && (
                <div className="px-3 pb-2 text-xs text-danger" role="alert">
                  {actionError}
                </div>
              )}
            </div>
          )}
          {result && (
            <div className={`${widthClass} max-h-[320px] overflow-y-auto p-3`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs opacity-60">
                  {result.type === 'translate' ? '翻译' : result.type === 'explain' ? '解释' : '验证'}
                  {result.streaming && ' · 生成中…'}
                </span>
                <button
                  onClick={result.streaming ? cancelInline : close}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                  aria-label={result.streaming ? '停止生成' : '关闭'}
                >
                  <X size={14} />
                </button>
              </div>
              {result.error ? (
                <div className="space-y-2" role="alert">
                  <div className="text-sm text-danger whitespace-pre-wrap">{result.error}</div>
                  {result.retryable && (
                    <button
                      type="button"
                      onClick={() => runInline(result.type)}
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <RotateCcw size={12} />
                      重试
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className="text-sm whitespace-pre-wrap font-serif"
                  role={result.streaming ? 'status' : undefined}
                  aria-live={result.streaming ? 'polite' : undefined}
                  style={{ color: 'var(--color-bubble-text)' }}
                >
                  {result.text || '…'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function BubbleButton({
  onClick,
  icon,
  disabled = false,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: 'var(--color-bubble-text)' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
          'var(--color-bubble-accent)';
        (e.currentTarget as HTMLButtonElement).style.color = '#fff';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-bubble-text)';
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
