'use client';

/**
 * @fileoverview TimelineEntryCard — single timeline row.
 *
 * Compact card showing: type tag · timestamp · page · original snippet ·
 * user question (if any) · AI response · sources (if verify) · model + cost.
 */

import type { TimelineEntry, SourceRef, TaskType } from '@/types/domain';
import { useReaderStore } from '@/stores/readerStore';
import { useTimelineStore } from '@/stores/timelineStore';

const TYPE_LABEL: Record<TaskType, string> = {
  translate: '翻译',
  explain: '解释',
  verify: '验证',
  summarize: '总结',
  chat: '对话',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function formatTypeLabel(type: string): string {
  return TYPE_LABEL[type as TaskType] ?? '未知';
}

function formatConfidenceLabel(confidence: string | undefined): string | null {
  if (!confidence) return null;
  return CONFIDENCE_LABEL[confidence] ?? null;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatTime(d: Date): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAnchorHint(entry: TimelineEntry): string {
  const hints: string[] = [];
  const page = entry.page ?? entry.anchor?.page;

  if (Number.isFinite(page) && page && page > 0) {
    hints.push(`第 ${page} 页`);
  }

  if (
    entry.anchor &&
    Number.isFinite(entry.anchor.start) &&
    Number.isFinite(entry.anchor.end) &&
    entry.anchor.start >= 0 &&
    entry.anchor.end >= entry.anchor.start
  ) {
    hints.push(`位置 ${entry.anchor.start}-${entry.anchor.end}`);
  }

  return hints.join('，');
}

function formatTokenTotal(entry: TimelineEntry): string {
  const input = sanitizeTokenCount(entry.costTokens.input);
  const output = sanitizeTokenCount(entry.costTokens.output);
  return `${input + output} tokens`;
}

function sanitizeTokenCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function formatCostAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '$0.0000';
  return `$${value.toFixed(4)}`;
}

function safeSourceHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol.toLowerCase())) {
      return parsed.href;
    }
  } catch {
    return null;
  }

  return null;
}

function sourceLabel(source: SourceRef, href: string | null): string {
  const title = source.title.trim();
  if (title) return title;
  return href ?? '无效来源链接';
}

export function TimelineEntryCard({ entry }: { entry: TimelineEntry }) {
  const { jumpToAnchor, setSidebarOpen, setThreadAnchor } = useReaderStore();
  const setPanelOpen = useTimelineStore(s => s.setPanelOpen);
  const anchorHint = formatAnchorHint(entry);
  const aiResponse = normalizeOptionalText(entry.aiResponse) ?? 'AI 回答为空';
  const sourceJumpLabel = anchorHint ? `跳回原文，${anchorHint}` : '跳回原文片段';
  const continueThreadLabel = '继续这段原文的对话';
  const userInput = normalizeOptionalText(entry.userInput);
  const confidenceLabel =
    entry.type === 'verify' ? formatConfidenceLabel(entry.confidence) : null;
  const continueThread = () => {
    if (!entry.threadId) return;
    setThreadAnchor({
      threadId: entry.threadId,
      originalText: entry.originalText,
      type: 'chat',
    });
    setPanelOpen(false);
    setSidebarOpen(true);
  };

  return (
    <div className="border-b border-divider py-4 last:border-0">
      <div className="flex items-center gap-2 text-xs text-subtle mb-2">
        <span className="px-2 py-0.5 rounded bg-[var(--color-accent)]/10 text-accent">
          {formatTypeLabel(entry.type)}
        </span>
        <span>{formatTime(entry.timestamp)}</span>
        {entry.page && <span>p.{entry.page}</span>}
      </div>

      {entry.originalText && (
        <button
          type="button"
          aria-label={sourceJumpLabel}
          title={sourceJumpLabel}
          onClick={() =>
            jumpToAnchor({
              chapterId: entry.chapterId,
              text: entry.originalText,
              start: entry.anchor?.start,
              end: entry.anchor?.end,
              page: entry.page ?? entry.anchor?.page,
            })
          }
          className="block w-full text-left"
        >
          <div className="text-sm text-muted border-l-2 border-divider pl-3 mb-2 font-serif italic line-clamp-3 hover:text-foreground hover:border-accent transition">
            {entry.originalText}
          </div>
        </button>
      )}

      {userInput && (
        <div className="text-sm text-foreground mb-2">
          <span className="text-subtle">问：</span>
          {userInput}
        </div>
      )}

      <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-6 font-serif">
        {aiResponse}
      </div>

      {confidenceLabel && (
        <div className="mt-2 text-xs text-subtle">
          置信度：<span className="text-foreground">{confidenceLabel}</span>
        </div>
      )}

      {entry.sources && entry.sources.length > 0 && (
        <div className="mt-2 space-y-1">
          {entry.sources.slice(0, 5).map((s, i) => {
            const href = safeSourceHref(s.url);
            const label = sourceLabel(s, href);

            return href ? (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-info hover:underline truncate"
              >
                [{i + 1}] {label}
              </a>
            ) : (
              <span key={i} className="block text-xs text-subtle truncate">
                [{i + 1}] {label}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-2 text-xs text-subtle">
        {entry.aiModel} · {formatTokenTotal(entry)} · {formatCostAmount(entry.costAmount)}
      </div>

      {entry.threadId && (
        <button
          type="button"
          aria-label={continueThreadLabel}
          title={continueThreadLabel}
          onClick={continueThread}
          className="mt-2 text-xs text-accent hover:underline"
        >
          继续对话
        </button>
      )}
    </div>
  );
}
