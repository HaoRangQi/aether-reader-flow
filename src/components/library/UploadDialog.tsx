'use client';

import { useState } from 'react';
import { BookService, detectFormat } from '@/services/BookService';
import { PdfParser } from '@/adapters/parsers/PdfParser';
import { EpubParser } from '@/adapters/parsers/EpubParser';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Modal dialog for uploading a book. Accepts PDF or EPUB. Parsing runs
 * client-side via `BookService.upload`, which routes to the right parser
 * based on MIME type / extension.
 *
 * UX details:
 *   - Native <input accept> is a hint, not a hard filter — some browsers
 *     still let users pick anything. We re-validate format on selection
 *     and on drop, giving a clear Chinese error before any parsing starts.
 *   - Drag-and-drop is supported; the drop zone shows a hover state.
 */
export function UploadDialog({ open, onClose, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [hover, setHover] = useState(false);

  if (!open) return null;

  /** Synchronous pre-check before kicking off parsing. */
  const validate = (file: File): string | null => {
    if (!file.name && !file.type) return '无法识别这个文件';
    if (file.size === 0) return '文件是空的';
    if (file.size > MAX_BYTES) {
      return `文件超出 ${MAX_BYTES / 1024 / 1024} MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)} MB）`;
    }
    const fmt = detectFormat(file, file.name);
    if (!fmt) {
      return `暂不支持「${file.name || '该文件'}」。当前仅接受 PDF (.pdf) 与 EPUB (.epub)`;
    }
    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setProgress('');
    const fail = validate(file);
    if (fail) {
      setError(fail);
      return;
    }
    setBusy(true);
    const fmt = detectFormat(file, file.name)!;
    setProgress(`正在解析 ${fmt.toUpperCase()}…`);
    try {
      const svc = new BookService(
        { pdf: new PdfParser(), epub: new EpubParser() },
        new IndexedDBBookRepo(),
        new IndexedDBChapterRepo(),
      );
      await svc.upload(file, file.name);
      setProgress('完成');
      onUploaded();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setError(msg);
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-dialog-title"
    >
      <div
        className="bg-surface rounded-2xl p-8 w-[480px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div id="upload-dialog-title" className="text-xl font-serif mb-2">
          上传书籍
        </div>
        <div className="text-sm text-muted mb-4">
          支持 <strong>PDF</strong> 与 <strong>EPUB</strong>。EPUB 章节结构基于 spine 自动识别，效果通常优于 PDF。
        </div>

        <label
          onDragOver={e => {
            e.preventDefault();
            if (!busy) setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
          className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
            hover
              ? 'border-accent bg-[var(--color-accent)]/5'
              : 'border-border hover:border-muted'
          } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="text-sm text-foreground mb-1">
            点击选择文件，或拖拽到这里
          </div>
          <div className="text-xs text-subtle">.pdf · .epub · 最大 500MB</div>
          <input
            type="file"
            accept=".pdf,.epub,application/pdf,application/epub+zip"
            disabled={busy}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              // 重置 input 让用户能重选同一个文件
              e.target.value = '';
            }}
            className="hidden"
          />
        </label>

        {progress && (
          <div className="mt-4 text-sm text-info" role="status">
            {progress}
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-danger" role="alert">
            {error}
          </div>
        )}
        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
