import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDb } from './db';
import { IndexedDBCostRepo } from './IndexedDBCostRepo';
import type { CostRecord } from '@/types/domain';

const mk = (overrides: Partial<CostRecord> = {}): CostRecord => ({
  id: `cost-${Math.random()}`,
  timestamp: new Date('2026-01-01T12:00:00Z'),
  model: 'claude-sonnet-4-6',
  tokens: { input: 100, output: 50 },
  amountUSD: 0.01,
  taskType: 'chat',
  ...overrides,
});

describe('IndexedDBCostRepo', () => {
  let repo: IndexedDBCostRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBCostRepo();
  });

  it('lists records in timestamp range order with an exclusive upper bound', async () => {
    await repo.add(mk({
      id: 'upper',
      timestamp: new Date('2026-01-02T00:00:00Z'),
    }));
    await repo.add(mk({
      id: 'inside-late',
      timestamp: new Date('2026-01-01T18:00:00Z'),
    }));
    await repo.add(mk({
      id: 'before',
      timestamp: new Date('2025-12-31T23:59:00Z'),
    }));
    await repo.add(mk({
      id: 'inside-early',
      timestamp: new Date('2026-01-01T00:00:00Z'),
    }));

    const rows = await repo.listInRange(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(rows.map(row => row.id)).toEqual(['inside-early', 'inside-late']);
  });

  it('returns no records or totals for an empty or reversed time range', async () => {
    await repo.add(mk({ id: 'inside' }));

    const emptyFrom = new Date('2026-01-02T00:00:00Z');
    const emptyTo = new Date('2026-01-02T00:00:00Z');
    const reversedFrom = new Date('2026-01-03T00:00:00Z');
    const reversedTo = new Date('2026-01-02T00:00:00Z');

    await expect(repo.listInRange(emptyFrom, emptyTo)).resolves.toEqual([]);
    await expect(repo.listInRange(reversedFrom, reversedTo)).resolves.toEqual([]);
    await expect(repo.totalInRange(emptyFrom, emptyTo)).resolves.toBe(0);
    await expect(repo.totalForTaskType(reversedFrom, reversedTo, 'chat')).resolves.toBe(0);
  });

  it('normalizes non-finite and negative cost values before storing', async () => {
    await repo.add(mk({
      id: 'dirty',
      tokens: { input: Number.NaN, output: Number.POSITIVE_INFINITY },
      amountUSD: Number.NEGATIVE_INFINITY,
    }));

    const [row] = await repo.listInRange(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(row.tokens).toEqual({ input: 0, output: 0 });
    expect(row.amountUSD).toBe(0);
  });

  it('ignores non-finite historical amounts when calculating totals', async () => {
    const db = getDb();
    await db.costRecords.bulkPut([
      mk({ id: 'good-chat', amountUSD: 1, taskType: 'chat' }),
      mk({ id: 'dirty-chat', amountUSD: Number.NaN, taskType: 'chat' }),
      mk({ id: 'dirty-translate', amountUSD: Number.POSITIVE_INFINITY, taskType: 'translate' }),
    ]);

    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-02T00:00:00Z');

    expect(await repo.totalInRange(from, to)).toBe(1);
    expect(await repo.totalForTaskType(from, to, 'chat')).toBe(1);
    expect(await repo.totalForTaskType(from, to, 'translate')).toBe(0);
  });
});
