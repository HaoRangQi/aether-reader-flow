'use client';

/**
 * @fileoverview ExportDialog — modal for choosing format + range.
 *
 * Wraps `ExportService.toMarkdown` / `toHTML` and triggers a browser
 * download. No server round-trip; entirely client-side.
 */

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { ExportService } from '@/services/ExportService';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import type { Chapter } from '@/types/domain';
import { X } from 'lucide-react';

type Format = 'markdown' | 'html';

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

/** Restrict filename to safe characters for cross-OS downloads. */
function sanitizeFilename(name: string): string {
  // Allow word chars + CJK; collapse the rest to `_`.
  return name.replace(/[^\w一-鿿]/g, '_').slice(0, 80) || 'export';
}

export function ExportDialog({ bookId, open, onClose }: Props) {
  const [format, setFormat] = useState<Format>('markdown');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [allChapters, setAllChapters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setError(null);
    (async () => {
      const list = await new IndexedDBChapterRepo().listByBook(bookId);
      setChapters(list);
      setSelectedChapterIds(list.map(c => c.id));
    })();
  }, [open, bookId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const svc = new ExportService(
        new IndexedDBBookRepo(),
        new IndexedDBChapterRepo(),
        new IndexedDBTimelineRepo(),
      );
      const filter = allChapters ? {} : { chapterIds: selectedChapterIds };
      const book = await new IndexedDBBookRepo().get(bookId);
      const safeName = sanitizeFilename(book?.title ?? 'export');
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
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <GlassPanel
        className="w-[520px] p-6"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h3 className="font-serif text-xl">导出思考文档</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <div className="text-sm text-muted mb-2">格式</div>
            <div className="flex gap-2">
              {(['markdown', 'html'] as Format[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
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
            <div className="text-sm text-muted mb-2">范围</div>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allChapters}
                onChange={e => setAllChapters(e.target.checked)}
              />
              全部章节
            </label>
            {!allChapters && (
              <div className="max-h-40 overflow-y-auto pl-5 space-y-1 border border-divider rounded-md p-2">
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

          {error && (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {error}
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
              disabled={busy || (!allChapters && selectedChapterIds.length === 0)}
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
