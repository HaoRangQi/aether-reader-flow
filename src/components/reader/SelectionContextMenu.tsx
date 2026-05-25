'use client';

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useSelectionActions } from '@/hooks/useSelectionActions';
import { SelectionNoteForm } from './SelectionNoteForm';
import {
  Languages,
  BookOpen,
  Globe,
  MessageSquare,
  Highlighter,
  StickyNote,
  X,
} from 'lucide-react';

interface ContextMenuState {
  x: number;
  y: number;
}

interface SelectionContextMenuProps {
  menuState: ContextMenuState | null;
  onClose: () => void;
}

export function SelectionContextMenu({ menuState, onClose }: SelectionContextMenuProps) {
  const selection = useReaderStore(s => s.selection);
  const {
    result,
    runInline,
    openDeep,
    createHighlight,
    createNote,
    cancelInline,
    close,
  } = useSelectionActions();
  const menuRef = useRef<HTMLDivElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [pendingNote, setPendingNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const closeMenu = useCallback(() => {
    close();
    onClose();
  }, [close, onClose]);

  useEffect(() => {
    if (!menuState) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    // slight delay so the same click that opened the menu doesn't close it
    const id = setTimeout(() => window.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousedown', handler);
    };
  }, [menuState, closeMenu]);

  useEffect(() => {
    if (!menuState) return;
    window.setTimeout(() => {
      const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstItem?.focus();
    }, 0);
  }, [menuState]);

  // Close on scroll
  useEffect(() => {
    if (!menuState) return;
    const handler = () => closeMenu();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [menuState, closeMenu]);

  if (!menuState || !selection) return null;

  const items = [
    {
      label: '翻译',
      icon: <Languages size={13} />,
      action: () => { void runInline('translate'); },
    },
    {
      label: '解释',
      icon: <BookOpen size={13} />,
      action: () => { void runInline('explain'); },
    },
    {
      label: '验证',
      icon: <Globe size={13} />,
      action: () => { void runInline('verify'); },
    },
    {
      label: '深入探讨',
      icon: <MessageSquare size={13} />,
      action: () => { openDeep(); onClose(); },
    },
    {
      label: '高亮',
      icon: <Highlighter size={13} />,
      action: () => { void createHighlight(); onClose(); },
    },
    {
      label: '笔记',
      icon: <StickyNote size={13} />,
      action: () => {
        setActionError(null);
        setNoteDraft('');
        setNoteOpen(true);
      },
    },
  ];

  const submitNote = async () => {
    if (pendingNote) return;
    setActionError(null);
    setPendingNote(true);
    try {
      await createNote(noteDraft);
      onClose();
    } catch (error) {
      setActionError(`笔记创建失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPendingNote(false);
    }
  };

  // Clamp to viewport
  const x = Math.max(8, Math.min(menuState.x, window.innerWidth - 180));
  const menuHeight = result || noteOpen ? 280 : items.length * 36;
  const y = Math.max(8, Math.min(menuState.y, window.innerHeight - menuHeight - 16));

  const focusMenuItem = (index: number) => {
    const menuItems = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!menuItems?.length) return;
    menuItems[(index + menuItems.length) % menuItems.length]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const currentIndex = menuItems.findIndex(item => item === document.activeElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusMenuItem(currentIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusMenuItem(currentIndex - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusMenuItem(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusMenuItem(menuItems.length - 1);
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`划词操作：${selection.text.slice(0, 24)}`}
      onKeyDown={handleKeyDown}
      className="fixed z-50 py-1 rounded-xl border shadow-xl backdrop-blur-xl backdrop-saturate-150 min-w-[160px]"
      style={{
        top: y,
        left: x,
        backgroundColor: 'var(--color-bubble-bg)',
        borderColor: 'var(--color-glass-border)',
      }}
    >
      {result ? (
        <div className="w-[320px] max-h-[260px] overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs opacity-60">
              {result.type === 'translate' ? '翻译' : result.type === 'explain' ? '解释' : '验证'}
              {result.streaming && ' · 生成中…'}
            </span>
            <button
              type="button"
              onClick={result.streaming ? cancelInline : closeMenu}
              className="opacity-50 transition-opacity hover:opacity-100"
              aria-label={result.streaming ? '停止生成' : '关闭'}
            >
              <X size={14} />
            </button>
          </div>
          {result.error ? (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {result.error}
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
      ) : noteOpen ? (
        <div>
          <SelectionNoteForm
            value={noteDraft}
            onChange={setNoteDraft}
            onCancel={() => setNoteOpen(false)}
            onSubmit={() => { void submitNote(); }}
            disabled={pendingNote}
          />
          {actionError && (
            <div className="px-3 pb-2 text-xs text-danger" role="alert">
              {actionError}
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className="px-3 py-1.5 text-[11px] opacity-50 border-b truncate max-w-[200px]"
            style={{ borderColor: 'var(--color-glass-border)', color: 'var(--color-bubble-text)' }}
          >
            「{selection.text.slice(0, 24)}{selection.text.length > 24 ? '…' : ''}」
          </div>
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={item.action}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors"
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
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
