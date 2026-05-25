'use client';

/**
 * @fileoverview TimelinePanel — right-side panel showing AI interaction history.
 *
 * Layout:
 *   - Header: title + close button
 *   - Filters: search input + chapter dropdown + type chips
 *   - List: TimelineEntryCard per entry, reverse-chronological
 *
 * Reload triggers:
 *   - panel opens (reload via book id)
 *   - filter/query changes (reload via book id)
 *   - chapter changes? no — user might want to view all entries while
 *     reading a particular chapter
 */

import { useEffect, useState } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { TimelineEntryCard } from './TimelineEntryCard';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { X } from 'lucide-react';
import type { TaskType } from '@/types/domain';

const ALL_TYPES: TaskType[] = ['translate', 'explain', 'verify', 'summarize', 'chat'];
const TYPE_LABEL: Record<TaskType, string> = {
  translate: '翻译',
  explain: '解释',
  verify: '验证',
  summarize: '总结',
  chat: '对话',
};

export function TimelinePanel() {
  const { book, chapters } = useReaderStore();
  const bookId = book?.id;
  const {
    entries,
    filter,
    query,
    panelOpen,
    setPanelOpen,
    setFilter,
    setQuery,
    reload,
  } = useTimelineStore();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!panelOpen || !bookId) return;

    let cancelled = false;

    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true);
          setLoadError(null);
        }
        return reload(bookId);
      })
      .catch(error => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '未知错误');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [panelOpen, bookId, filter, query, reload]);

  if (!panelOpen || !book) return null;

  const hasActiveFilter = Boolean(query || filter.chapterId || filter.types?.length);
  const clearFilters = () => {
    setQuery('');
    setFilter({});
  };

  const toggleType = (t: TaskType) => {
    const cur = filter.types ?? [];
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    setFilter({ ...filter, types: next.length ? next : undefined });
  };

  return (
    <aside className="fixed inset-0 z-40 flex h-screen w-full min-h-0 flex-col border-l border-divider arf-anim-slide-right md:static md:w-96 md:shrink-0">
      <GlassPanel className="m-2 flex min-h-0 flex-1 flex-col rounded-2xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h2 className="font-serif text-base">时间轴</h2>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-muted hover:text-foreground"
            aria-label="关闭时间轴面板"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-3 space-y-2 border-b border-divider">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索原文 / AI 回答 / 提问…"
            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="搜索时间轴条目"
          />
          <select
            value={filter.chapterId ?? ''}
            onChange={e => setFilter({ ...filter, chapterId: e.target.value || undefined })}
            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
            aria-label="按章节筛选时间轴"
          >
            <option value="">全部章节</option>
            {chapters.map(c => (
              <option key={c.id} value={c.id}>
                {c.orderIndex}. {c.title}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1" role="group" aria-label="按交互类型筛选时间轴">
            {ALL_TYPES.map(t => {
              const active = filter.types?.includes(t) ?? false;
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  aria-pressed={active}
                  aria-label={`${active ? '取消筛选' : '筛选'}${TYPE_LABEL[t]}条目`}
                  className={`text-xs px-2 py-1 rounded ${
                    active
                      ? 'bg-accent text-white'
                      : 'bg-surface text-muted border border-border'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-2 overscroll-contain"
          role="status"
          aria-live="polite"
          aria-label={entries.length === 0 ? '时间轴空状态' : `时间轴结果，共 ${entries.length} 个条目`}
        >
          {loadError ? (
            <div className="mb-3 text-xs text-danger" role="alert">
              时间轴加载失败：{loadError}
            </div>
          ) : null}
          {loading ? <div className="mb-3 text-xs text-subtle">正在加载时间轴…</div> : null}
          {entries.length === 0 ? (
            <div className="text-center text-subtle py-12 text-sm">
              <p>{hasActiveFilter ? '没有匹配的条目' : '开始划词，AI 会陪你读懂'}</p>
              {hasActiveFilter ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 text-xs text-accent hover:underline"
                >
                  清除筛选
                </button>
              ) : null}
            </div>
          ) : (
            entries.map(e => <TimelineEntryCard key={e.id} entry={e} />)
          )}
        </div>
      </GlassPanel>
    </aside>
  );
}
