'use client';

import { useState } from 'react';
import { BookService } from '@/services/BookService';
import { PdfParser } from '@/adapters/parsers/PdfParser';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

/**
 * Modal dialog for uploading a PDF. The actual work runs client-side in
 * `BookService.upload`. We show coarse-grained progress messages because
 * PDF.js doesn't surface progress events without extra wiring.
 *
 * Why no spinner library? Native `<progress>` would be fine for indeterminate
 * states, but most browsers' default styling is jarring. P5 will replace
 * the textual progress with a proper Skeleton component.
 */
export function UploadDialog({ open, onClose, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  if (!open) return null;

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setProgress('正在解析 PDF…');
    try {
      const svc = new BookService(
        new PdfParser(),
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
        <div id="upload-dialog-title" className="text-xl font-serif mb-4">
          上传 PDF
        </div>
        <input
          type="file"
          accept="application/pdf"
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
