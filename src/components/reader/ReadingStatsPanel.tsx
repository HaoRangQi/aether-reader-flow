'use client';

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { IndexedDBAnnotationRepo } from '@/adapters/storage/IndexedDBAnnotationRepo';
import { IndexedDBReadingProgressRepo } from '@/adapters/storage/IndexedDBReadingProgressRepo';
import { IndexedDBReadingSessionRepo } from '@/adapters/storage/IndexedDBReadingSessionRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { useReaderStore } from '@/stores/readerStore';
import { useConfigStore } from '@/stores/configStore';
import { buildReadingStats, type ReadingStats } from '@/lib/reading-stats';
import type { TaskType } from '@/types/domain';
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Flame,
  Highlighter,
  PenLine,
  Target,
  Timer,
  X,
} from 'lucide-react';

interface ReadingStatsPanelProps {
  open: boolean;
  onClose: () => void;
}

const TASK_LABEL: Record<TaskType, string> = {
  translate: '翻译',
  explain: '解释',
  verify: '验证',
  summarize: '总结',
  chat: '对话',
};

export function ReadingStatsPanel({ open, onClose }: ReadingStatsPanelProps) {
  const { book, chapters } = useReaderStore();
  const dailyReadingGoalMinutes = useConfigStore(s => s.dailyReadingGoalMinutes);
  const setDailyReadingGoalMinutes = useConfigStore(s => s.setDailyReadingGoalMinutes);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null);
  const displayedGoal = goalDraft ?? String(dailyReadingGoalMinutes);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !book) {
      setStats(null);
      setStatsError(null);
      return;
    }
    let cancelled = false;
    setStats(null);
    setStatsError(null);
    (async () => {
      try {
        const [progress, annotations, timelineEntries, readingSessions] = await Promise.all([
          new IndexedDBReadingProgressRepo().get(book.id),
          new IndexedDBAnnotationRepo().listByBook(book.id),
          new IndexedDBTimelineRepo().listByBook(book.id),
          new IndexedDBReadingSessionRepo().listByBook(book.id),
        ]);
        if (cancelled) return;
        setStats(buildReadingStats({
          chapters,
          progress,
          annotations,
          timelineEntries,
          readingSessions,
          dailyGoalMinutes: dailyReadingGoalMinutes,
        }));
      } catch (error) {
        if (cancelled) return;
        setStatsError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, book, chapters, dailyReadingGoalMinutes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveGoal = async () => {
    const normalizedGoal = displayedGoal.trim();
    if (normalizedGoal === '') {
      setGoalSaveError(null);
      setGoalDraft(null);
      return;
    }

    const minutes = Number(normalizedGoal);
    if (!Number.isFinite(minutes)) {
      setGoalSaveError('请输入有效的分钟数');
      return;
    }
    if (minutes < 0) {
      setGoalSaveError('请输入不小于 0 的分钟数');
      return;
    }
    try {
      await setDailyReadingGoalMinutes(minutes);
      setGoalSaveError(null);
      setGoalDraft(null);
    } catch (error) {
      setGoalSaveError(error instanceof Error ? error.message : '阅读目标保存失败');
    }
  };

  if (!open || !book) return null;

  return (
    <aside className="fixed inset-0 z-40 flex h-screen w-full flex-col border-l border-divider arf-anim-slide-right md:static md:w-96 md:shrink-0">
      <GlassPanel className="flex-1 m-2 flex flex-col rounded-2xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-accent" />
            <h2 className="font-serif text-base">阅读统计</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
            aria-label="关闭统计"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {statsError ? (
            <div className="text-center text-danger py-12 text-sm">
              统计读取失败：{statsError}
            </div>
          ) : !stats ? (
            <div className="text-center text-subtle py-12 text-sm">正在统计…</div>
          ) : (
            <div className="space-y-5">
              <section>
                <div className="flex items-end justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs text-subtle mb-1">整体进度</div>
                    <div className="text-3xl font-serif text-foreground">
                      {stats.progressPercent}%
                    </div>
                  </div>
                  <div className="text-right text-xs text-subtle">
                    <div>{stats.completedChapters}/{stats.totalChapters} 章</div>
                    <div className="mt-1 line-clamp-1">{stats.currentChapterLabel}</div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${stats.progressPercent}%` }}
                  />
                </div>
              </section>

              <section className="rounded-md border border-divider bg-surface/50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-subtle">
                    <Target size={14} />
                    <span>今日阅读目标</span>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-subtle">
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={displayedGoal}
                      onChange={event => {
                        setGoalSaveError(null);
                        setGoalDraft(event.target.value);
                      }}
                      onBlur={() => void saveGoal()}
                      onKeyDown={event => {
                        if (event.key === 'Enter') void saveGoal();
                      }}
                      aria-label="今日阅读目标分钟数"
                      aria-invalid={goalSaveError ? 'true' : 'false'}
                      className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-foreground outline-none focus:border-accent"
                    />
                    分钟
                  </label>
                </div>
                {goalSaveError ? (
                  <div role="alert" className="mb-2 text-xs text-danger">
                    目标保存失败：{goalSaveError}
                  </div>
                ) : null}
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className={stats.readingTime.goalMet ? 'text-success' : 'text-muted'}>
                    {stats.readingTime.goalMet
                      ? '今日已达成'
                      : `还差 ${formatDuration(stats.readingTime.remainingTodayMs)}`}
                  </span>
                  <span className="text-subtle">{stats.readingTime.dailyGoalPercent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${stats.readingTime.dailyGoalPercent}%` }}
                  />
                </div>
              </section>

              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<BookOpen size={15} />}
                  label="已读字数"
                  value={formatNumber(stats.estimatedReadWords)}
                  sub={`共 ${formatNumber(stats.totalWords)}`}
                />
                <StatCard
                  icon={<Clock3 size={15} />}
                  label="阅读时长"
                  value={formatDuration(stats.readingTime.totalMs)}
                  sub={`今日 ${formatDuration(stats.readingTime.todayMs)}`}
                />
                <StatCard
                  icon={<Timer size={15} />}
                  label="阅读速度"
                  value={`${formatNumber(stats.readingTime.wordsPerMinute)}/分`}
                  sub={`${stats.readingTime.sessions} 次阅读`}
                />
                <StatCard
                  icon={<Highlighter size={15} />}
                  label="批注"
                  value={formatNumber(stats.annotations.total)}
                  sub={`${stats.annotations.highlights} 高亮 · ${stats.annotations.notes} 笔记`}
                />
                <StatCard
                  icon={<Bot size={15} />}
                  label="AI 交互"
                  value={formatNumber(stats.ai.total)}
                  sub={`${formatNumber(stats.ai.inputTokens + stats.ai.outputTokens)} tokens`}
                />
                <StatCard
                  icon={<CircleDollarSign size={15} />}
                  label="AI 成本"
                  value={`$${stats.ai.costUSD.toFixed(4)}`}
                  sub="当前书累计"
                />
              </div>

              <section className="rounded-md border border-divider bg-surface/50 p-3">
                <div className="mb-3 flex items-center gap-2 text-xs text-subtle">
                  <Flame size={14} />
                  <span>阅读习惯</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <HabitMetric
                    label="活跃天数"
                    value={`${stats.readingTime.activeDays} 天`}
                  />
                  <HabitMetric
                    label="连续阅读"
                    value={`${stats.readingTime.currentStreakDays} 天`}
                  />
                  <HabitMetric
                    label="常读时段"
                    value={stats.readingTime.favoriteHourLabel}
                  />
                  <HabitMetric
                    label="AI 使用密度"
                    value={`${formatNumber(stats.readingTime.aiInteractionsPerHour)}/小时`}
                  />
                  <HabitMetric
                    label="最常阅读"
                    value={stats.readingTime.mostReadChapter
                      ? stats.readingTime.mostReadChapter.title
                      : '暂无'}
                  />
                  <HabitMetric
                    label="章节时长"
                    value={stats.readingTime.mostReadChapter
                      ? formatDuration(stats.readingTime.mostReadChapter.durationMs)
                      : '暂无'}
                  />
                </div>
              </section>

              <section className="rounded-md border border-divider bg-surface/50 p-3">
                <div className="mb-3 flex items-center gap-2 text-xs text-subtle">
                  <CalendarDays size={14} />
                  <span>最近 7 天</span>
                </div>
                <div className="grid h-28 grid-cols-7 items-end gap-1.5">
                  {stats.readingTime.recentDays.map(day => (
                    <ReadingDayBar
                      key={day.date}
                      day={day}
                      maxDurationMs={Math.max(
                        ...stats.readingTime.recentDays.map(item => item.durationMs),
                        stats.readingTime.dailyGoalMinutes * 60_000,
                        1,
                      )}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-md border border-divider bg-surface/50 p-3">
                <div className="flex items-center gap-2 text-xs text-subtle mb-3">
                  <PenLine size={14} />
                  <span>AI 任务分布</span>
                </div>
                <div className="space-y-2">
                  {(Object.keys(TASK_LABEL) as TaskType[]).map(type => (
                    <TaskBar
                      key={type}
                      label={TASK_LABEL[type]}
                      count={stats.ai.byType[type]}
                      total={stats.ai.total}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </GlassPanel>
    </aside>
  );
}

function StatCard({
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
      <div className="flex items-center gap-1.5 text-xs text-subtle mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-serif text-xl text-foreground">{value}</div>
      <div className="text-xs text-subtle mt-1">{sub}</div>
    </div>
  );
}

function HabitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-subtle">{label}</div>
      <div className="mt-1 truncate font-serif text-base text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}

function ReadingDayBar({
  day,
  maxDurationMs,
}: {
  day: ReadingStats['readingTime']['recentDays'][number];
  maxDurationMs: number;
}) {
  const heightPercent = day.durationMs > 0
    ? Math.max(12, Math.round((day.durationMs / maxDurationMs) * 100))
    : 4;

  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
      <div className="flex h-20 w-full items-end rounded-sm bg-border/60">
        <div
          className={`w-full rounded-sm ${day.goalMet ? 'bg-success' : 'bg-accent'}`}
          style={{ height: `${Math.min(100, heightPercent)}%` }}
          title={`${formatDayLabel(day.date)}：${formatDuration(day.durationMs)}，${day.sessions} 次`}
        />
      </div>
      <div className="w-full truncate text-center text-[10px] text-subtle">
        {formatDayLabel(day.date)}
      </div>
    </div>
  );
}

function TaskBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="text-subtle">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}
