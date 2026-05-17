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

export function BudgetIndicator() {
  const { todayUSD, monthUSD, refresh } = useCostStore();
  const { budgetCNY } = useConfigStore();
  const lastBucketRef = useRef<'safe' | 'warn' | 'over'>('safe');
  const pushToast = useToastStore(s => s.push);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Threshold alerts: when crossing 80% / 100% from below, push a toast.
  useEffect(() => {
    if (budgetCNY <= 0) return;
    const monthCNY = CostMeter.usdToCNY(monthUSD);
    const pct = (monthCNY / budgetCNY) * 100;
    const bucket: 'safe' | 'warn' | 'over' = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'safe';
    if (bucket === lastBucketRef.current) return;
    const prev = lastBucketRef.current;
    lastBucketRef.current = bucket;
    if (bucket === 'warn' && prev === 'safe') {
      pushToast('本月 AI 调用已达 80% 预算', 'warning');
    } else if (bucket === 'over') {
      pushToast('本月 AI 调用已超出预算', 'danger');
    }
  }, [monthUSD, budgetCNY, pushToast]);

  const monthCNY = CostMeter.usdToCNY(monthUSD);
  const todayCNY = CostMeter.usdToCNY(todayUSD);
  const pct = budgetCNY > 0 ? (monthCNY / budgetCNY) * 100 : 0;
  const cls =
    pct >= 100
      ? 'text-danger'
      : pct >= 80
        ? 'text-warning'
        : 'text-subtle';

  return (
    <div className="text-xs flex flex-col items-end" title="本月 / 今日累计 AI 调用花费">
      <span className={cls}>
        本月 ¥{monthCNY.toFixed(2)} / ¥{budgetCNY} ({pct.toFixed(0)}%)
      </span>
      <span className="text-subtle">今日 ¥{todayCNY.toFixed(2)}</span>
    </div>
  );
}
