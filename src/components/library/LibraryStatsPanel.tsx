'use client';

import { BarChart3, Bot, CircleDollarSign, Highlighter, Library, StickyNote } from 'lucide-react';
import type { LibraryStats } from '@/lib/reading-stats';

interface LibraryStatsPanelProps {
  stats: LibraryStats;
}

export function LibraryStatsPanel({ stats }: LibraryStatsPanelProps) {
  const averageProgressPercent = sanitizePercent(stats.averageProgressPercent);
  const recentProgressPercent = stats.recentBook
    ? sanitizePercent(stats.recentBook.progressPercent)
    : 0;

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <BarChart3 size={16} className="text-accent" />
            <span>阅读仪表盘</span>
          </div>
          <div className="mt-1 text-xs text-subtle">
            {stats.recentBook
              ? `最近阅读：${stats.recentBook.title} · ${recentProgressPercent}%`
              : '尚未开始阅读'}
          </div>
        </div>

        <div className="min-w-44">
          <div className="mb-1 flex items-center justify-between text-xs text-subtle">
            <span>平均进度</span>
            <span>{averageProgressPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${averageProgressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          icon={<Library size={15} />}
          label="藏书"
          value={formatNumber(stats.totalBooks)}
          sub={`${formatNumber(stats.activeBooks)} 本在读`}
        />
        <StatTile
          icon={<BarChart3 size={15} />}
          label="完成"
          value={formatNumber(stats.completedBooks)}
          sub="已读完"
        />
        <StatTile
          icon={<Highlighter size={15} />}
          label="批注"
          value={formatNumber(stats.totalAnnotations)}
          sub="高亮与笔记"
        />
        <StatTile
          icon={<StickyNote size={15} />}
          label="笔记"
          value={formatNumber(stats.totalNotes)}
          sub="手动记录"
        />
        <StatTile
          icon={<Bot size={15} />}
          label="AI 交互"
          value={formatNumber(stats.totalAiInteractions)}
          sub="全库累计"
        />
        <StatTile
          icon={<CircleDollarSign size={15} />}
          label="AI 成本"
          value={`$${sanitizeCurrencyAmount(stats.totalAiCostUSD).toFixed(4)}`}
          sub="全库累计"
        />
      </div>
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-md border border-divider bg-surface/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-subtle">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-serif text-xl text-foreground">{value}</div>
      <div className="mt-1 text-xs text-subtle">{sub}</div>
    </div>
  );
}

function formatNumber(value: number): string {
  const normalized = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return new Intl.NumberFormat('zh-CN').format(normalized);
}

function sanitizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function sanitizeCurrencyAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
