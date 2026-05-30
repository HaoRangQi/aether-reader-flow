import { beforeEach, describe, expect, it, vi } from 'vitest';

const costMeterMocks = vi.hoisted(() => ({
  totalToday: vi.fn(),
  totalThisMonth: vi.fn(),
}));

vi.mock('@/services/CostMeter', () => ({
  CostMeter: vi.fn(function CostMeter() {
    return costMeterMocks;
  }),
}));

vi.mock('@/adapters/storage/IndexedDBCostRepo', () => ({
  IndexedDBCostRepo: vi.fn(function IndexedDBCostRepo() {
    return {};
  }),
}));

import { _resetCostStoreForTests, useCostStore } from './costStore';

describe('costStore', () => {
  beforeEach(() => {
    costMeterMocks.totalToday.mockReset();
    costMeterMocks.totalThisMonth.mockReset();
    _resetCostStoreForTests();
  });

  it('refreshes today and month totals', async () => {
    costMeterMocks.totalToday.mockResolvedValue(1.5);
    costMeterMocks.totalThisMonth.mockResolvedValue(12.25);

    await useCostStore.getState().refresh();

    expect(useCostStore.getState().todayUSD).toBe(1.5);
    expect(useCostStore.getState().monthUSD).toBe(12.25);
  });

  it('normalizes invalid totals before exposing them to UI state', async () => {
    costMeterMocks.totalToday.mockResolvedValue(Number.NaN);
    costMeterMocks.totalThisMonth.mockResolvedValue(-3);

    await useCostStore.getState().refresh();

    expect(useCostStore.getState().todayUSD).toBe(0);
    expect(useCostStore.getState().monthUSD).toBe(0);

    costMeterMocks.totalToday.mockResolvedValue(Number.POSITIVE_INFINITY);
    costMeterMocks.totalThisMonth.mockResolvedValue(Number.NEGATIVE_INFINITY);

    await useCostStore.getState().refresh();

    expect(useCostStore.getState().todayUSD).toBe(0);
    expect(useCostStore.getState().monthUSD).toBe(0);
  });
});
