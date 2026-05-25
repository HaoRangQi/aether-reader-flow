'use client';

/**
 * @fileoverview ExportDialog — modal for choosing format + range.
 *
 * Wraps `ExportService.toMarkdown` / `toHTML` and triggers a browser
 * download. No server round-trip; entirely client-side.
 */

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import {
  ExportService,
  sanitizeExportFilename,
  type ExportFilter,
  type ExportTemplate,
} from '@/services/ExportService';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { IndexedDBAnnotationRepo } from '@/adapters/storage/IndexedDBAnnotationRepo';
import type { Chapter } from '@/types/domain';
import { X } from 'lucide-react';

type Format = 'markdown' | 'html';

const TEMPLATE_OPTIONS: Array<{ value: ExportTemplate; label: string }> = [
  { value: 'full-report', label: '完整阅读报告' },
  { value: 'verification-only', label: '仅验证结果' },
  { value: 'annotations-only', label: '仅批注' },
];

interface Props {
  bookId: string;
  open: boolean;
  onClose: () => void;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportDialog({ bookId, open, onClose }: Props) {
  const [format, setFormat] = useState<Format>('markdown');
  const [template, setTemplate] = useState<ExportTemplate>('full-report');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [allChapters, setAllChapters] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chapterLoadError, setChapterLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setChapterLoadError(null);
    setChaptersLoading(true);
    setChapters([]);
    setSelectedChapterIds([]);
    (async () => {
      try {
        const list = await new IndexedDBChapterRepo().listByBook(bookId);
        if (cancelled) return;
        setChapters(list);
        setSelectedChapterIds(list.map(c => c.id));
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setChapterLoadError(`章节列表加载失败：${message}`);
      } finally {
        if (!cancelled) setChaptersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const noChapterSelected = !allChapters && selectedChapterIds.length === 0;
  const selectedCount = allChapters ? chapters.length : selectedChapterIds.length;
  const templateLabel = TEMPLATE_OPTIONS.find(option => option.value === template)?.label
    ?? '完整阅读报告';
  const exportStatus = chaptersLoading
    ? '正在加载章节…'
    : noChapterSelected
      ? `请至少选择一个章节后导出「${templateLabel}」。`
      : `将以「${templateLabel}」模板导出 ${selectedCount} 个章节为 ${
          format === 'markdown' ? 'Markdown' : 'HTML'
        }。`;
  const exportDisabled = busy || chaptersLoading || Boolean(chapterLoadError) || noChapterSelected;

  const handleExport = async () => {
    if (exportDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const svc = new ExportService(
        new IndexedDBBookRepo(),
        new IndexedDBChapterRepo(),
        new IndexedDBTimelineRepo(),
        new IndexedDBAnnotationRepo(),
      );
      const filter: ExportFilter = allChapters
        ? { template }
        : { chapterIds: selectedChapterIds, template };
      const book = await new IndexedDBBookRepo().get(bookId);
      const safeName = sanitizeExportFilename(book?.title ?? 'export');
      if (format === 'markdown') {
        const md = await svc.toMarkdown(bookId, filter);
        download(`${safeName}.md`, md, 'text/markdown');
      } else {
        const html = await svc.toHTML(bookId, filter);
        download(`${safeName}.html`, html, 'text/html');
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      aria-describedby="export-dialog-status"
    >
      <GlassPanel
        className="w-[520px] p-6"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h3 id="export-dialog-title" className="font-serif text-xl">导出思考文档</h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-muted hover:text-foreground p-1"
            aria-label="关闭导出弹窗"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <div className="text-sm text-muted mb-2">格式</div>
            <div className="flex gap-2" role="group" aria-label="导出格式">
              {(['markdown', 'html'] as Format[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  className={`px-4 py-2 text-sm rounded-md transition ${
                    format === f
                      ? 'bg-accent text-white'
                      : 'border border-border text-foreground hover:bg-surface-elevated'
                  }`}
                >
                  {f === 'markdown' ? 'Markdown' : 'HTML'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted mb-2">模板</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="导出模板">
              {TEMPLATE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setTemplate(option.value)}
                  aria-pressed={template === option.value}
                  className={`px-4 py-2 text-sm rounded-md transition ${
                    template === option.value
                      ? 'bg-accent text-white'
                      : 'border border-border text-foreground hover:bg-surface-elevated'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted mb-2">范围</div>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer" htmlFor="export-all-chapters">
              <input
                id="export-all-chapters"
                type="checkbox"
                checked={allChapters}
                onChange={e => setAllChapters(e.target.checked)}
                aria-describedby="export-dialog-status"
              />
              全部章节
            </label>
            {!allChapters && (
              <div
                className="max-h-40 overflow-y-auto pl-5 space-y-1 border border-divider rounded-md p-2"
                role="group"
                aria-label="选择要导出的章节"
              >
                {chapters.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedChapterIds.includes(c.id)}
                      onChange={e =>
                        setSelectedChapterIds(prev =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter(x => x !== c.id),
                        )
                      }
                    />
                    <span className="truncate">{c.orderIndex}. {c.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div id="export-dialog-status" className="text-xs text-subtle" role="status" aria-live="polite">
            {exportStatus}
          </div>

          {error && (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {error}
            </div>
          )}

          {chapterLoadError && (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {chapterLoadError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleExport}
              disabled={exportDisabled}
              aria-describedby="export-dialog-status"
              className="bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {busy ? '生成中…' : '导出'}
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
