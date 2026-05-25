import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { resetDb } from '@/adapters/storage/db';
import {
  ConfigService,
  DEFAULT_DAILY_READING_GOAL_MINUTES,
  DEFAULT_FONT_PREFS,
  DEFAULT_MONTHLY_BUDGET_CNY,
  DEFAULT_THEME,
} from '@/services/ConfigService';
import { _resetConfigStoreForTests, useConfigStore } from './configStore';

describe('configStore', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb();
    _resetConfigStoreForTests();
  });

  it('hydrates remaining settings when one config read fails', async () => {
    const svc = new ConfigService(new IndexedDBConfigRepo());
    const font = { ...DEFAULT_FONT_PREFS, readerSize: 21, readerLineHeight: 1.6 };
    await svc.setFontPrefs(font);
    await svc.setMonthlyBudgetCNY(128);
    await svc.setLocaleOverride('en');
    vi.spyOn(ConfigService.prototype, 'getTheme').mockRejectedValueOnce(new Error('bad theme'));

    await useConfigStore.getState().hydrate();

    const state = useConfigStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.theme).toEqual(DEFAULT_THEME);
    expect(state.font).toEqual(font);
    expect(state.budgetCNY).toBe(128);
    expect(state.localeOverride).toBe('en');
    expect(state.locale).toBe('en');
  });

  it('does not update the in-memory budget when persistence fails', async () => {
    await useConfigStore.getState().setBudget(420);
    vi.spyOn(ConfigService.prototype, 'setMonthlyBudgetCNY').mockRejectedValueOnce(
      new Error('write failed'),
    );

    await expect(useConfigStore.getState().setBudget(999)).rejects.toThrow('write failed');

    expect(useConfigStore.getState().budgetCNY).toBe(420);
  });

  it('normalizes invalid monthly budgets before persisting and updating memory', async () => {
    const setBudget = vi.spyOn(ConfigService.prototype, 'setMonthlyBudgetCNY');

    await useConfigStore.getState().setBudget(Number.NaN);

    expect(setBudget).toHaveBeenCalledWith(DEFAULT_MONTHLY_BUDGET_CNY);
    expect(useConfigStore.getState().budgetCNY).toBe(DEFAULT_MONTHLY_BUDGET_CNY);

    await useConfigStore.getState().setBudget(Number.POSITIVE_INFINITY);

    expect(setBudget).toHaveBeenLastCalledWith(DEFAULT_MONTHLY_BUDGET_CNY);
    expect(useConfigStore.getState().budgetCNY).toBe(DEFAULT_MONTHLY_BUDGET_CNY);

    await useConfigStore.getState().setBudget(-10);

    expect(setBudget).toHaveBeenLastCalledWith(0);
    expect(useConfigStore.getState().budgetCNY).toBe(0);
  });

  it('normalizes non-finite daily reading goals before persisting and updating memory', async () => {
    const setGoal = vi.spyOn(ConfigService.prototype, 'setDailyReadingGoalMinutes');

    await useConfigStore.getState().setDailyReadingGoalMinutes(Number.NaN);

    expect(setGoal).toHaveBeenCalledWith(DEFAULT_DAILY_READING_GOAL_MINUTES);
    expect(useConfigStore.getState().dailyReadingGoalMinutes).toBe(
      DEFAULT_DAILY_READING_GOAL_MINUTES,
    );

    await useConfigStore.getState().setDailyReadingGoalMinutes(Number.POSITIVE_INFINITY);

    expect(setGoal).toHaveBeenLastCalledWith(DEFAULT_DAILY_READING_GOAL_MINUTES);
    expect(useConfigStore.getState().dailyReadingGoalMinutes).toBe(
      DEFAULT_DAILY_READING_GOAL_MINUTES,
    );
  });

  it('does not update the in-memory daily reading goal when persistence fails', async () => {
    await useConfigStore.getState().setDailyReadingGoalMinutes(45.7);
    vi.spyOn(ConfigService.prototype, 'setDailyReadingGoalMinutes').mockRejectedValueOnce(
      new Error('write failed'),
    );

    await expect(useConfigStore.getState().setDailyReadingGoalMinutes(20)).rejects.toThrow(
      'write failed',
    );

    expect(useConfigStore.getState().dailyReadingGoalMinutes).toBe(46);
  });

  it('keeps explicit null locale override as follow-browser on repeated hydrate', async () => {
    const svc = new ConfigService(new IndexedDBConfigRepo());
    await svc.setLocaleOverride('en');
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().localeOverride).toBe('en');

    await svc.setLocaleOverride(null);
    await useConfigStore.getState().hydrate();
    await useConfigStore.getState().hydrate();

    expect(useConfigStore.getState().localeOverride).toBeNull();
    expect(useConfigStore.getState().hydrated).toBe(true);
    expect(useConfigStore.getState().budgetCNY).toBe(DEFAULT_MONTHLY_BUDGET_CNY);
  });
});
