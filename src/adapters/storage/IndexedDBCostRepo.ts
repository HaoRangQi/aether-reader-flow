/**
 * IndexedDB-backed CostRepo. Cost queries are time-windowed for the
 * "today/this month" badges in P4. Uses the `timestamp` index.
 */
import { getDb } from './db';
import type { CostRepo } from './interfaces';
import type { CostRecord, TaskType } from '@/types/domain';

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sanitizeCostRecord(record: CostRecord): CostRecord {
  return {
    ...record,
    tokens: {
      input: finiteNonNegative(record.tokens.input),
      output: finiteNonNegative(record.tokens.output),
    },
    amountUSD: finiteNonNegative(record.amountUSD),
  };
}

export class IndexedDBCostRepo implements CostRepo {
  async add(record: CostRecord): Promise<void> {
    await getDb().costRecords.put(sanitizeCostRecord(record));
  }

  async listInRange(from: Date, to: Date): Promise<CostRecord[]> {
    if (from.getTime() >= to.getTime()) return [];

    return await getDb()
      .costRecords.where('timestamp')
      .between(from, to, true, false)
      .toArray();
  }

  async totalInRange(from: Date, to: Date): Promise<number> {
    const rows = await this.listInRange(from, to);
    return rows.reduce((sum, r) => sum + finiteNonNegative(r.amountUSD), 0);
  }

  async totalForTaskType(from: Date, to: Date, type: TaskType): Promise<number> {
    const rows = await this.listInRange(from, to);
    return rows
      .filter(r => r.taskType === type)
      .reduce((sum, r) => sum + finiteNonNegative(r.amountUSD), 0);
  }
}
