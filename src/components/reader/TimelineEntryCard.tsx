'use client';

/**
 * @fileoverview TimelineEntryCard — single timeline row.
 *
 * Compact card showing: type tag · timestamp · page · original snippet ·
 * user question (if any) · AI response · sources (if verify) · model + cost.
 */

import type { TimelineEntry, TaskType } from '@/types/domain';

const TYPE_LABEL: Record<TaskType, string> = {
  translate: '翻译',
  explain: '解释',
  verify: '验证',
  summarize: '总结',
  chat: '对话',
};

function formatTime(d: Date): string {
  return new Date(d).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimelineEntryCard({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="border-b border-divider py-4 last:border-0">
      <div className="flex items-center gap-2 text-xs text-subtle mb-2">
        <span className="px-2 py-0.5 rounded bg-[var(--color-accent)]/10 text-accent">
          {TYPE_LABEL[entry.type]}
        </span>
        <span>{formatTime(entry.timestamp)}</span>
        {entry.page && <span>p.{entry.page}</span>}
      </div>

      {entry.originalText && (
        <blockquote className="text-sm text-muted border-l-2 border-divider pl-3 mb-2 font-serif italic line-clamp-3">
          {entry.originalText}
        </blockquote>
      )}

      {entry.userInput && (
        <div className="text-sm text-foreground mb-2">
          <span className="text-subtle">问：</span>
          {entry.userInput}
        </div>
      )}

      <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-6 font-serif">
        {entry.aiResponse}
      </div>

      {entry.sources && entry.sources.length > 0 && (
        <div className="mt-2 space-y-1">
          {entry.sources.slice(0, 5).map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-info hover:underline truncate"
            >
              [{i + 1}] {s.title || s.url}
            </a>
          ))}
        </div>
      )}

      <div className="mt-2 text-xs text-subtle">
        {entry.aiModel} · {entry.costTokens.input + entry.costTokens.output} tokens · $
        {entry.costAmount.toFixed(4)}
      </div>
    </div>
  );
}
