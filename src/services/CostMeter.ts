/**
 * @fileoverview CostMeter — converts token usage to USD and aggregates totals.
 *
 * Responsibilities:
 *   1. Compute USD for a given (model, inputTokens, outputTokens)
 *   2. Persist each AI call as a `CostRecord` via the injected `CostRepo`
 *   3. Answer "how much today / this month?"
 *   4. Convert USD → CNY using a fixed rate for display
 *
 * The USD→CNY rate is hardcoded at 7.2 for MVP simplicity. P5+ could
 * fetch a real rate, but the badge is a rough budget indicator — the
 * USD figure (recorded on the cost record) is the source of truth.
 */
import type { CostRepo } from '@/adapters/storage/interfaces';
import type { CostRecord } from '@/types/domain';
import { getPricing } from '@/lib/pricing';

const USD_TO_CNY = 7.2;

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()): Date {
  return new Date(startOfDay(d).getTime() + 86_400_000);
}

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export class CostMeter {
  constructor(private repo: CostRepo) {}

  /**
   * Compute USD cost without persisting. Useful for previewing a call
   * before the user confirms.
   */
  estimateUSD(model: string, inputTokens: number, outputTokens: number): number {
    const p = getPricing(model);
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  /**
   * Persist a cost record. `id` and `timestamp` are auto-assigned if absent.
   */
  async record(
    input: Omit<CostRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: Date },
  ): Promise<void> {
    const rec: CostRecord = {
      ...input,
      id: input.id ?? `cost-${crypto.randomUUID()}`,
      timestamp: input.timestamp ?? new Date(),
    };
    await this.repo.add(rec);
  }

  /** USD sum for today (midnight → midnight, local time). */
  async totalToday(): Promise<number> {
    return this.repo.totalInRange(startOfDay(), endOfDay());
  }

  /** USD sum for the current calendar month (local time). */
  async totalThisMonth(): Promise<number> {
    return this.repo.totalInRange(startOfMonth(), endOfMonth());
  }

  /** USD → CNY at fixed display rate 7.2. */
  static usdToCNY(usd: number): number {
    return usd * USD_TO_CNY;
  }
}
