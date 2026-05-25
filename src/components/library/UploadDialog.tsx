'use client';

import { useState } from 'react';
import { BookService, detectFormat } from '@/services/BookService';
import { PdfParser } from '@/adapters/parsers/PdfParser';
import { EpubParser } from '@/adapters/parsers/EpubParser';
import { TxtParser } from '@/adapters/parsers/TxtParser';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { useT } from '@/components/shared/I18nProvider';
import {
  createUploadBatch,
  updateUploadBatchItem,
  uploadBatchPercent,
  uploadBatchSummary,
  type UploadBatchItem,
} from '@/lib/upload-progress';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Modal dialog for uploading a book. Accepts PDF, EPUB, or TXT. Parsing runs
 * client-side via `BookService.upload`, which routes to the right parser
 * based on MIME type / extension.
 *
 * UX:
 *   - Native <input accept> is a hint, not a hard filter — we re-validate
 *     format/size on selection and on drop and give a clear localized error
 *     before any parsing starts.
 *   - Drag-and-drop supported with hover state.
 */
export function UploadDialog({ open, onClose, onUploaded }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<string>('');
  const [batchItems, setBatchItems] = useState<UploadBatchItem[]>([]);
  const [hover, setHover] = useState(false);

  if (!open) return null;

  const validate = (file: File): string | null => {
    if (!file.name && !file.type) return t('upload.error.unrecognized');
    if (file.size === 0) return t('upload.error.empty');
    if (file.size > MAX_BYTES) {
      return t('upload.error.tooLarge', {
        limit: MAX_BYTES / 1024 / 1024,
        size: (file.size / 1024 / 1024).toFixed(1),
      });
    }
    const fmt = detectFormat(file, file.name);
    if (!fmt) {
      return t('upload.error.unsupported', { name: file.name || '?' });
    }
    return null;
  };

  const handleFiles = async (files: FileList | File[]) => {
    const queue = Array.from(files);
    if (queue.length === 0) return;
    setErrors([]);
    setProgress('');
    const initialItems = createUploadBatch(queue);
    setBatchItems(initialItems);
    setBusy(true);
    const failures: string[] = [];
    let uploaded = 0;

    try {
      const svc = new BookService(
        { pdf: new PdfParser(), epub: new EpubParser(), txt: new TxtParser() },
        new IndexedDBBookRepo(),
        new IndexedDBChapterRepo(),
      );
      for (let index = 0; index < queue.length; index++) {
        const file = queue[index];
        const itemId = initialItems[index].id;
        const fail = validate(file);
        if (fail) {
          failures.push(`${file.name || '?'}：${fail}`);
          setBatchItems(items => updateUploadBatchItem(items, itemId, {
            status: 'failed',
            detail: fail,
          }));
          continue;
        }
        const fmt = detectFormat(file, file.name)!;
        setBatchItems(items => updateUploadBatchItem(items, itemId, {
          status: 'parsing',
          format: fmt.toUpperCase(),
        }));
        setProgress(
          `${t('upload.parsing')} ${index + 1}/${queue.length} · ${fmt.toUpperCase()} · ${file.name}`,
        );
        try {
          await svc.upload(file, file.name);
          uploaded++;
          setBatchItems(items => updateUploadBatchItem(items, itemId, {
            status: 'done',
            format: fmt.toUpperCase(),
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : t('upload.failed');
          failures.push(`${file.name || '?'}：${msg}`);
          setBatchItems(items => updateUploadBatchItem(items, itemId, {
            status: 'failed',
            format: fmt.toUpperCase(),
            detail: msg,
          }));
        }
      }

      if (uploaded > 0) onUploaded();
      if (failures.length === 0 && uploaded > 0) {
        setProgress(t('upload.done'));
        onClose();
      } else {
        setProgress(uploaded > 0 ? `已导入 ${uploaded}/${queue.length} 本` : '');
        setErrors(failures);
      }
    } finally {
      setBusy(false);
    }
  };

  const batchPercent = uploadBatchPercent(batchItems);
  const batchSummary = uploadBatchSummary(batchItems);
  const batchProcessed = batchSummary.done + batchSummary.failed;
  const batchLiveText =
    batchItems.length > 0
      ? `批量上传进度：已处理 ${batchProcessed}/${batchSummary.total}，${batchPercent}%${
          batchSummary.failed > 0 ? `，失败 ${batchSummary.failed}` : ''
        }`
      : '';

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    if (busy) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) void handleFiles(files);
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-dialog-title"
    >
      <div
        className="bg-surface rounded-2xl p-8 w-[480px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div id="upload-dialog-title" className="text-xl font-serif mb-2">
          {t('upload.title')}
        </div>
        <div className="text-sm text-muted mb-4">{t('upload.description')}</div>

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
          <div className="text-sm text-foreground mb-1">{t('upload.dropzone')}</div>
          <div className="text-xs text-subtle">{t('upload.formats')}</div>
          <input
            type="file"
            multiple
            accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
            disabled={busy}
            onChange={e => {
              const files = e.target.files;
              if (files && files.length > 0) void handleFiles(files);
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
        {batchItems.length > 0 && (
          <div
            className="mt-4 rounded-lg border border-divider bg-background/50 p-3"
            aria-live="polite"
            aria-atomic="true"
            aria-label="批量上传进度"
          >
            <div className="mb-2 flex items-center justify-between text-xs text-subtle">
              <span id="upload-batch-summary">
                已处理 {batchProcessed}/{batchSummary.total}
                {batchSummary.failed > 0 ? ` · 失败 ${batchSummary.failed}` : ''}
              </span>
              <span>{batchPercent}%</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-label="批量上传进度"
              aria-describedby="upload-batch-summary"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={batchPercent}
              aria-valuetext={batchLiveText}
            >
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${batchPercent}%` }}
              />
            </div>
            <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {batchItems.map(item => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate text-foreground">{item.name}</div>
                    {item.detail && (
                      <div className="mt-0.5 line-clamp-2 text-danger">{item.detail}</div>
                    )}
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 ${statusClass(item.status)}`}>
                    {statusLabel(item)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {errors.length > 0 && (
          <div className="mt-4 text-sm text-danger" role="alert">
            <div className="mb-1">部分文件导入失败：</div>
            <ul className="max-h-28 space-y-1 overflow-y-auto">
              {errors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            {t('upload.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusLabel(item: UploadBatchItem): string {
  if (item.status === 'pending') return '等待中';
  if (item.status === 'parsing') return item.format ? `解析中 · ${item.format}` : '解析中';
  if (item.status === 'done') return '完成';
  return '失败';
}

function statusClass(status: UploadBatchItem['status']): string {
  if (status === 'done') return 'bg-success/10 text-success';
  if (status === 'failed') return 'bg-danger/10 text-danger';
  if (status === 'parsing') return 'bg-info/10 text-info';
  return 'bg-surface text-subtle';
}
