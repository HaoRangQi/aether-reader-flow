import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBCostRepo } from '@/adapters/storage/IndexedDBCostRepo';
import { CostMeter } from './CostMeter';

describe('CostMeter', () => {
  let meter: CostMeter;

  beforeEach(async () => {
    await resetDb();
    meter = new CostMeter(new IndexedDBCostRepo());
  });

  it('estimates USD using pricing table', () => {
    // claude-sonnet-4-6: 3/M input, 15/M output
    expect(meter.estimateUSD('claude-sonnet-4-6', 1_000_000, 0)).toBe(3);
    expect(meter.estimateUSD('claude-sonnet-4-6', 0, 1_000_000)).toBe(15);
    expect(meter.estimateUSD('claude-sonnet-4-6', 1000, 500)).toBeCloseTo(
      3 * 0.001 + 15 * 0.0005,
      6,
    );
  });

  it('rejects invalid token counts when estimating USD', () => {
    const invalidTokenCounts = [-1, Number.NaN, Number.POSITIVE_INFINITY];

    for (const value of invalidTokenCounts) {
      expect(() => meter.estimateUSD('claude-sonnet-4-6', value, 0)).toThrow(RangeError);
      expect(() => meter.estimateUSD('claude-sonnet-4-6', 0, value)).toThrow(RangeError);
    }
  });

  it('records a cost entry with auto id + timestamp', async () => {
    await meter.record({
      model: 'claude-sonnet-4-6',
      tokens: { input: 1000, output: 500 },
      amountUSD: 0.01,
      taskType: 'chat',
    });
    const total = await meter.totalToday();
    expect(total).toBeCloseTo(0.01, 6);
  });

  it('rejects invalid cost records without changing totals', async () => {
    await expect(
      meter.record({
        model: 'claude-sonnet-4-6',
        tokens: { input: -1, output: 500 },
        amountUSD: 0.01,
        taskType: 'chat',
      }),
    ).rejects.toThrow(RangeError);

    await expect(
      meter.record({
        model: 'claude-sonnet-4-6',
        tokens: { input: 1000, output: Number.POSITIVE_INFINITY },
        amountUSD: 0.01,
        taskType: 'chat',
      }),
    ).rejects.toThrow(RangeError);

    await expect(
      meter.record({
        model: 'claude-sonnet-4-6',
        tokens: { input: 1000, output: 500 },
        amountUSD: Number.NaN,
        taskType: 'chat',
      }),
    ).rejects.toThrow(RangeError);

    await expect(
      meter.record({
        model: 'claude-sonnet-4-6',
        tokens: { input: 1000, output: 500 },
        amountUSD: 0.01,
        taskType: 'chat',
        timestamp: new Date(Number.NaN),
      }),
    ).rejects.toThrow(RangeError);

    expect(await meter.totalToday()).toBe(0);
  });

  it('rejects malformed token usage without changing totals', async () => {
    const malformedRecords = [
      { tokens: undefined },
      { tokens: null },
      { tokens: { input: '1000', output: 500 } },
      { tokens: { input: 1000 } },
    ];

    for (const record of malformedRecords) {
      await expect(
        meter.record({
          model: 'claude-sonnet-4-6',
          tokens: record.tokens,
          amountUSD: 0.01,
          taskType: 'chat',
        } as unknown as Parameters<CostMeter['record']>[0]),
      ).rejects.toThrow(RangeError);
    }

    expect(await meter.totalToday()).toBe(0);
  });

  it('totalToday sums only today', async () => {
    const repo = new IndexedDBCostRepo();
    const now = new Date();
    await repo.add({
      id: 'a',
      timestamp: now,
      model: 'x',
      tokens: { input: 0, output: 0 },
      amountUSD: 0.5,
      taskType: 'chat',
    });
    await repo.add({
      id: 'b',
      timestamp: new Date(now.getTime() - 48 * 3600_000),
      model: 'x',
      tokens: { input: 0, output: 0 },
      amountUSD: 9.99,
      taskType: 'chat',
    });
    expect(await meter.totalToday()).toBeCloseTo(0.5, 6);
  });

  it('totalThisMonth sums only this month', async () => {
    const repo = new IndexedDBCostRepo();
    const now = new Date();
    const sameMonth = new Date(now.getFullYear(), now.getMonth(), 1, 10);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await repo.add({
      id: 'a',
      timestamp: sameMonth,
      model: 'x',
      tokens: { input: 0, output: 0 },
      amountUSD: 1,
      taskType: 'chat',
    });
    await repo.add({
      id: 'b',
      timestamp: lastMonth,
      model: 'x',
      tokens: { input: 0, output: 0 },
      amountUSD: 5,
      taskType: 'chat',
    });
    expect(await meter.totalThisMonth()).toBeCloseTo(1, 6);
  });

  it('usdToCNY uses fixed 7.2 rate', () => {
    expect(CostMeter.usdToCNY(1)).toBeCloseTo(7.2);
    expect(CostMeter.usdToCNY(10)).toBeCloseTo(72);
  });

  it('normalizes non-displayable CNY values', () => {
    expect(CostMeter.usdToCNY(-0)).toBe(0);
    expect(CostMeter.usdToCNY(-1)).toBe(0);
    expect(CostMeter.usdToCNY(Number.NaN)).toBe(0);
    expect(CostMeter.usdToCNY(Number.POSITIVE_INFINITY)).toBe(0);
    expect(CostMeter.usdToCNY(Number.MAX_VALUE)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('IndexedDBCostRepo.totalForTaskType', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('sums only the requested task type', async () => {
    const repo = new IndexedDBCostRepo();
    const now = new Date();
    await repo.add({
      id: 'a',
      timestamp: now,
      model: 'x',
      tokens: { input: 0, output: 0 },
      amountUSD: 1,
      taskType: 'translate',
    });
    await repo.add({
      id: 'b',
      timestamp: now,
      model: 'x',
      tokens: { input: 0, output: 0 },
      amountUSD: 2,
      taskType: 'verify',
    });
    const from = new Date(now.getTime() - 60_000);
    const to = new Date(now.getTime() + 60_000);
    expect(await repo.totalForTaskType(from, to, 'translate')).toBeCloseTo(1);
    expect(await repo.totalForTaskType(from, to, 'verify')).toBeCloseTo(2);
  });
});
