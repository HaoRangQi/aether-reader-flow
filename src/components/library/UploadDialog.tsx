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

/**
 * Modal dialog for uploading a book. Accepts PDF or EPUB. Parsing runs
 * client-side via `BookService.upload`, which routes to the right parser
 * based on MIME type / extension.
 */
export function UploadDialog({ open, onClose, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  if (!open) return null;

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    const fmt = detectFormat(file, file.name);
    setProgress(fmt ? `正在解析 ${fmt.toUpperCase()}…` : '正在解析…');
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
        <input
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          disabled={busy}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-accent file:text-white file:cursor-pointer hover:file:bg-[var(--color-accent-hover)]"
        />
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
