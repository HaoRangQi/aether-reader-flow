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

import { useEffect } from 'react';
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

  useEffect(() => {
    if (panelOpen && book) {
      void reload(book.id);
    }
  }, [panelOpen, book, filter, query, reload]);

  if (!panelOpen || !book) return null;

  const toggleType = (t: TaskType) => {
    const cur = filter.types ?? [];
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    setFilter({ ...filter, types: next.length ? next : undefined });
  };

  return (
    <aside className="w-96 shrink-0 h-screen flex flex-col border-l border-divider arf-anim-slide-right">
      <GlassPanel className="flex-1 m-2 flex flex-col rounded-2xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h2 className="font-serif text-base">时间轴</h2>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-muted hover:text-foreground"
            aria-label="关闭"
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
          />
          <select
            value={filter.chapterId ?? ''}
            onChange={e => setFilter({ ...filter, chapterId: e.target.value || undefined })}
            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">全部章节</option>
            {chapters.map(c => (
              <option key={c.id} value={c.id}>
                {c.orderIndex}. {c.title}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {ALL_TYPES.map(t => {
              const active = filter.types?.includes(t) ?? false;
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
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

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {entries.length === 0 ? (
            <div className="text-center text-subtle py-12 text-sm">
              {query || filter.chapterId || filter.types?.length
                ? '没有匹配的条目'
                : '开始划词，AI 会陪你读懂'}
            </div>
          ) : (
            entries.map(e => <TimelineEntryCard key={e.id} entry={e} />)
          )}
        </div>
      </GlassPanel>
    </aside>
  );
}
