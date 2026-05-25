import { describe, expect, it } from 'vitest';
import { getBudgetIndicatorState, getBudgetToastDecision } from './BudgetIndicator';

describe('getBudgetIndicatorState', () => {
  it('marks spend below 80% as safe', () => {
    const state = getBudgetIndicatorState(1, 10, 100);

    expect(state.bucket).toBe('safe');
    expect(state.className).toBe('text-subtle');
    expect(state.pct).toBe(72);
    expect(state.monthLabel).toBe('本月 ¥72.00 / ¥100 (72%)');
    expect(state.todayCNY).toBe(7.2);
  });

  it('marks spend from 80% to below 100% as warning', () => {
    const state = getBudgetIndicatorState(0, 12, 100);

    expect(state.bucket).toBe('warn');
    expect(state.className).toBe('text-warning');
    expect(state.pct).toBe(86.4);
    expect(state.monthLabel).toBe('本月 ¥86.40 / ¥100 (86%)');
  });

  it('marks spend at or above 100% as over budget', () => {
    const state = getBudgetIndicatorState(0, 20, 100);

    expect(state.bucket).toBe('over');
    expect(state.className).toBe('text-danger');
    expect(state.pct).toBe(144);
    expect(state.monthLabel).toBe('本月 ¥144.00 / ¥100 (144%)');
  });

  it('disables percentage display when budget is invalid', () => {
    const zeroBudget = getBudgetIndicatorState(0, 20, 0);
    const invalidBudget = getBudgetIndicatorState(0, 20, Number.NaN);

    expect(zeroBudget.bucket).toBe('disabled');
    expect(zeroBudget.pct).toBeNull();
    expect(zeroBudget.className).toBe('text-subtle');
    expect(zeroBudget.monthLabel).toBe('本月 ¥144.00 · 未设置预算');
    expect(invalidBudget.bucket).toBe('disabled');
    expect(invalidBudget.pct).toBeNull();
  });

  it('treats invalid or negative spend inputs as zero for display and thresholds', () => {
    const state = getBudgetIndicatorState(Number.NaN, Number.POSITIVE_INFINITY, 100);
    const negative = getBudgetIndicatorState(-1, -20, 100);

    expect(state.bucket).toBe('safe');
    expect(state.pct).toBe(0);
    expect(state.todayCNY).toBe(0);
    expect(state.monthCNY).toBe(0);
    expect(state.monthLabel).toBe('本月 ¥0.00 / ¥100 (0%)');
    expect(negative.monthLabel).toBe('本月 ¥0.00 / ¥100 (0%)');
  });

  it('keeps labels finite for extreme spend and budget values', () => {
    const extremeSpend = getBudgetIndicatorState(0, Number.MAX_VALUE, 100);
    const tinyBudget = getBudgetIndicatorState(0, 1, Number.MIN_VALUE);
    const tinyFiniteBudget = getBudgetIndicatorState(0, Number.MAX_VALUE, 1e-300);
    const decimalBudget = getBudgetIndicatorState(0, 1, 10.5);

    expect(extremeSpend.bucket).toBe('over');
    expect(extremeSpend.monthCNY).toBe(Number.MAX_SAFE_INTEGER);
    expect(extremeSpend.monthLabel).not.toContain('Infinity');
    expect(extremeSpend.monthLabel).not.toContain('NaN');
    expect(tinyBudget.pct).toBe(Number.MAX_SAFE_INTEGER);
    expect(tinyBudget.monthLabel).not.toContain('Infinity');
    expect(tinyBudget.monthLabel).not.toContain('NaN');
    expect(tinyFiniteBudget.pct).toBe(Number.MAX_SAFE_INTEGER);
    expect(tinyFiniteBudget.monthLabel).not.toContain('1e+');
    expect(decimalBudget.monthLabel).toBe('本月 ¥7.20 / ¥10.50 (69%)');
  });
});

describe('getBudgetToastDecision', () => {
  it('fires warning only when entering warn from safe', () => {
    expect(getBudgetToastDecision('safe', 'warn')).toEqual({
      message: '本月 AI 调用已达 80% 预算',
      variant: 'warning',
    });
    expect(getBudgetToastDecision('warn', 'warn')).toBeNull();
    expect(getBudgetToastDecision('over', 'warn')).toBeNull();
  });

  it('fires danger when entering over budget from any enabled bucket', () => {
    expect(getBudgetToastDecision('safe', 'over')).toEqual({
      message: '本月 AI 调用已超出预算',
      variant: 'danger',
    });
    expect(getBudgetToastDecision('warn', 'over')).toEqual({
      message: '本月 AI 调用已超出预算',
      variant: 'danger',
    });
  });

  it('does not fire for disabled or downward transitions', () => {
    expect(getBudgetToastDecision('safe', 'disabled')).toBeNull();
    expect(getBudgetToastDecision('warn', 'safe')).toBeNull();
    expect(getBudgetToastDecision('over', 'safe')).toBeNull();
  });
});
