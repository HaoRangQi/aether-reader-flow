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
const MAX_DISPLAY_CNY = Number.MAX_SAFE_INTEGER;

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

function assertFiniteNonNegative(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a finite non-negative number`);
  }
}

function assertTokenUsage(value: unknown): asserts value is CostRecord['tokens'] {
  if (!value || typeof value !== 'object') {
    throw new RangeError('tokens must include finite non-negative input and output numbers');
  }

  const tokens = value as Partial<CostRecord['tokens']>;
  assertFiniteNonNegative(tokens.input, 'tokens.input');
  assertFiniteNonNegative(tokens.output, 'tokens.output');
}

function assertValidDate(value: Date | undefined, fieldName: string): void {
  if (value !== undefined && Number.isNaN(value.getTime())) {
    throw new RangeError(`${fieldName} must be a valid Date`);
  }
}

export class CostMeter {
  constructor(private repo: CostRepo) {}

  /**
   * Compute USD cost without persisting. Useful for previewing a call
   * before the user confirms.
   */
  estimateUSD(model: string, inputTokens: number, outputTokens: number): number {
    assertFiniteNonNegative(inputTokens, 'inputTokens');
    assertFiniteNonNegative(outputTokens, 'outputTokens');

    const p = getPricing(model);
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  /**
   * Persist a cost record. `id` and `timestamp` are auto-assigned if absent.
   */
  async record(
    input: Omit<CostRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: Date },
  ): Promise<void> {
    assertTokenUsage(input.tokens);
    assertFiniteNonNegative(input.amountUSD, 'amountUSD');
    assertValidDate(input.timestamp, 'timestamp');

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
    if (!Number.isFinite(usd) || usd <= 0) return 0;

    const cny = usd * USD_TO_CNY;
    if (!Number.isFinite(cny)) return MAX_DISPLAY_CNY;
    return Math.min(cny, MAX_DISPLAY_CNY);
  }
}
