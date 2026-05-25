'use client';

import { type KeyboardEvent, useEffect, useRef } from 'react';

interface SelectionNoteFormProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function SelectionNoteForm({
  value,
  onChange,
  onCancel,
  onSubmit,
  disabled = false,
}: SelectionNoteFormProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      onSubmit();
    }
  };

  return (
    <form
      className="w-[320px] space-y-2 p-3"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="selection-note-content" className="block text-xs opacity-60">
        添加笔记
      </label>
      <textarea
        ref={inputRef}
        id="selection-note-content"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={3}
        placeholder="写下这段文字为什么重要…"
        aria-label="笔记内容"
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-md px-3 py-1.5 text-xs text-muted hover:bg-surface disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-accent px-3 py-1.5 text-xs text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {disabled ? '保存中…' : '保存笔记'}
        </button>
      </div>
      <div className="text-[11px] text-subtle">Cmd/Ctrl + Enter 保存 · Esc 取消</div>
    </form>
  );
}
