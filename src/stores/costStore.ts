'use client';

/**
 * @fileoverview Zustand store for the global cost summary (today / this month).
 *
 * Used by BudgetIndicator + per-message CostBadge. After every AI call,
 * the AISidebar / SelectionPopover should `refresh()` so the badge updates.
 */
import { create } from 'zustand';
import { CostMeter } from '@/services/CostMeter';
import { IndexedDBCostRepo } from '@/adapters/storage/IndexedDBCostRepo';

interface CostState {
  todayUSD: number;
  monthUSD: number;
  refresh: () => Promise<void>;
}

const meter = new CostMeter(new IndexedDBCostRepo());

export const useCostStore = create<CostState>(set => ({
  todayUSD: 0,
  monthUSD: 0,
  refresh: async () => {
    const [todayUSD, monthUSD] = await Promise.all([
      meter.totalToday(),
      meter.totalThisMonth(),
    ]);
    set({ todayUSD, monthUSD });
  },
}));
