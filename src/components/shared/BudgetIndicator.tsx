'use client';

/**
 * @fileoverview BudgetIndicator — global cost summary shown in nav areas.
 *
 * Renders monthly total (CNY) versus budget, with color escalation:
 *   - <80%   → subtle gray
 *   - 80-99% → warning yellow
 *   - ≥100%  → danger red
 *
 * Also shows today's total for context.
 *
 * Refreshes on mount and whenever the cost store's refresh() runs (any
 * AI call site should call it after persisting).
 */

import { useEffect, useRef } from 'react';
import { useCostStore } from '@/stores/costStore';
import { useConfigStore } from '@/stores/configStore';
import { CostMeter } from '@/services/CostMeter';
import { useToastStore } from '@/stores/toastStore';

export type BudgetBucket = 'disabled' | 'safe' | 'warn' | 'over';
export type BudgetToastDecision = { message: string; variant: 'warning' | 'danger' } | null;
const MAX_DISPLAY_PCT = Number.MAX_SAFE_INTEGER;

export interface BudgetIndicatorState {
  todayCNY: number;
  monthCNY: number;
  pct: number | null;
  bucket: BudgetBucket;
  className: string;
  monthLabel: string;
}

export function getBudgetIndicatorState(
  todayUSD: number,
  monthUSD: number,
  budgetCNY: number,
): BudgetIndicatorState {
  const monthCNY = CostMeter.usdToCNY(monthUSD);
  const todayCNY = CostMeter.usdToCNY(todayUSD);
  const hasBudget = Number.isFinite(budgetCNY) && budgetCNY > 0;

  if (!hasBudget) {
    return {
      todayCNY,
      monthCNY,
      pct: null,
      bucket: 'disabled',
      className: 'text-subtle',
      monthLabel: `本月 ¥${monthCNY.toFixed(2)} · 未设置预算`,
    };
  }

  const pct = clampDisplayPct((monthCNY / budgetCNY) * 100);
  const bucket: BudgetBucket = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'safe';
  const className =
    bucket === 'over'
      ? 'text-danger'
      : bucket === 'warn'
        ? 'text-warning'
        : 'text-subtle';

  return {
    todayCNY,
    monthCNY,
    pct,
    bucket,
    className,
    monthLabel: `本月 ¥${monthCNY.toFixed(2)} / ¥${formatCNY(budgetCNY)} (${pct.toFixed(0)}%)`,
  };
}

export function getBudgetToastDecision(
  previousBucket: BudgetBucket,
  nextBucket: BudgetBucket,
): BudgetToastDecision {
  if (nextBucket === 'disabled' || nextBucket === previousBucket) return null;

  if (nextBucket === 'warn' && previousBucket === 'safe') {
    return { message: '本月 AI 调用已达 80% 预算', variant: 'warning' };
  }

  if (nextBucket === 'over') {
    return { message: '本月 AI 调用已超出预算', variant: 'danger' };
  }

  return null;
}

function formatCNY(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function clampDisplayPct(value: number): number {
  if (!Number.isFinite(value)) return MAX_DISPLAY_PCT;
  return Math.max(0, Math.min(value, MAX_DISPLAY_PCT));
}

export function BudgetIndicator() {
  const { todayUSD, monthUSD, refresh } = useCostStore();
  const { budgetCNY } = useConfigStore();
  const lastBucketRef = useRef<BudgetBucket>('safe');
  const pushToast = useToastStore(s => s.push);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Threshold alerts: when crossing 80% / 100% from below, push a toast.
  useEffect(() => {
    const { bucket } = getBudgetIndicatorState(todayUSD, monthUSD, budgetCNY);
    if (bucket === 'disabled') {
      lastBucketRef.current = 'safe';
      return;
    }
    if (bucket === lastBucketRef.current) return;
    const prev = lastBucketRef.current;
    lastBucketRef.current = bucket;
    const toast = getBudgetToastDecision(prev, bucket);
    if (toast) {
      pushToast(toast.message, toast.variant);
    }
  }, [todayUSD, monthUSD, budgetCNY, pushToast]);

  const indicator = getBudgetIndicatorState(todayUSD, monthUSD, budgetCNY);

  return (
    <div className="text-xs flex flex-col items-end" title="本月 / 今日累计 AI 调用花费">
      <span className={indicator.className}>{indicator.monthLabel}</span>
      <span className="text-subtle">今日 ¥{indicator.todayCNY.toFixed(2)}</span>
    </div>
  );
}
