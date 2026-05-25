import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import {
  ConfigService,
  DEFAULT_TASK_ROUTING,
  DEFAULT_FONT_PREFS,
  DEFAULT_THEME,
  DEFAULT_MONTHLY_BUDGET_CNY,
  DEFAULT_DAILY_READING_GOAL_MINUTES,
  DEFAULT_PROMPT_OVERRIDES,
  DEFAULT_SELECTION_PREFS,
} from './ConfigService';

describe('ConfigService', () => {
  let repo: IndexedDBConfigRepo;
  let svc: ConfigService;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBConfigRepo();
    svc = new ConfigService(repo);
  });

  it('returns defaults when nothing is set', async () => {
    expect(await svc.getTheme()).toEqual(DEFAULT_THEME);
    expect(await svc.getTaskRouting()).toEqual(DEFAULT_TASK_ROUTING);
    expect(await svc.getFontPrefs()).toEqual(DEFAULT_FONT_PREFS);
    expect(await svc.getMonthlyBudgetCNY()).toBe(DEFAULT_MONTHLY_BUDGET_CNY);
    expect(await svc.getDailyReadingGoalMinutes()).toBe(DEFAULT_DAILY_READING_GOAL_MINUTES);
    expect(await svc.getCustomThemes()).toEqual([]);
  });

  it('persists and retrieves theme', async () => {
    await svc.setTheme({ id: 'maple', mode: 'dark' });
    expect(await svc.getTheme()).toEqual({ id: 'maple', mode: 'dark' });
  });

  it('recovers theme mode when stored config is invalid', async () => {
    await repo.set('theme', { id: 'maple', mode: 'system' });

    expect(await svc.getTheme()).toEqual({ id: 'maple', mode: DEFAULT_THEME.mode });
  });

  it('persists task routing', async () => {
    const routing = {
      ...DEFAULT_TASK_ROUTING,
      translate: { serviceId: 's1', modelId: 'claude-haiku-4-5' },
    };
    await svc.setTaskRouting(routing);
    expect(await svc.getTaskRouting()).toEqual(routing);
  });

  it('recovers task routing entries independently when stored config is incomplete', async () => {
    await repo.set('taskRouting', {
      translate: { serviceId: '', modelId: 'claude-haiku-4-5' },
      verify: { serviceId: 's1', modelId: 'm1' },
      summarize: null,
      chat: { serviceId: 's2' },
    });

    expect(await svc.getTaskRouting()).toEqual({
      ...DEFAULT_TASK_ROUTING,
      verify: { serviceId: 's1', modelId: 'm1' },
    });
  });

  it('persists font prefs', async () => {
    const f = { ...DEFAULT_FONT_PREFS, family: 'custom' as const, customCSS: 'Optima, serif' };
    await svc.setFontPrefs(f);
    expect(await svc.getFontPrefs()).toEqual(f);
  });

  it('persists monthly budget', async () => {
    await svc.setMonthlyBudgetCNY(500);
    expect(await svc.getMonthlyBudgetCNY()).toBe(500);
  });

  it('recovers monthly budget when stored config is not a non-negative number', async () => {
    await repo.set('monthlyBudgetCNY', -1);
    expect(await svc.getMonthlyBudgetCNY()).toBe(DEFAULT_MONTHLY_BUDGET_CNY);

    await repo.set('monthlyBudgetCNY', '500');
    expect(await svc.getMonthlyBudgetCNY()).toBe(DEFAULT_MONTHLY_BUDGET_CNY);
  });

  it('persists daily reading goal minutes', async () => {
    await svc.setDailyReadingGoalMinutes(45.7);
    expect(await svc.getDailyReadingGoalMinutes()).toBe(46);
  });

  it('clamps daily reading goal to zero', async () => {
    await svc.setDailyReadingGoalMinutes(-5);
    expect(await svc.getDailyReadingGoalMinutes()).toBe(0);
  });

  it('recovers daily reading goal when stored config is invalid', async () => {
    await repo.set('dailyReadingGoalMinutes', Number.NaN);
    expect(await svc.getDailyReadingGoalMinutes()).toBe(DEFAULT_DAILY_READING_GOAL_MINUTES);

    await repo.set('dailyReadingGoalMinutes', 12.4);
    expect(await svc.getDailyReadingGoalMinutes()).toBe(12);
  });

  it('returns null locale override by default (follow browser)', async () => {
    expect(await svc.getLocaleOverride()).toBeNull();
  });

  it('persists locale override', async () => {
    await svc.setLocaleOverride('en');
    expect(await svc.getLocaleOverride()).toBe('en');
    await svc.setLocaleOverride(null);
    expect(await svc.getLocaleOverride()).toBeNull();
  });

  it('recovers prompt overrides by dropping non-string task values', async () => {
    await repo.set('promptOverrides', {
      translate: 'Use terse translation.',
      explain: 42,
      verify: null,
      summarize: { text: 'bad' },
    });

    expect(await svc.getPromptOverrides()).toEqual({
      ...DEFAULT_PROMPT_OVERRIDES,
      translate: 'Use terse translation.',
    });
  });

  it('recovers selection prefs when stored config contains invalid values', async () => {
    await repo.set('selectionPrefs', {
      bubbleBg: '#111111',
      bubbleText: null,
      bubbleAccent: 42,
      resultWidth: 'full',
    });

    expect(await svc.getSelectionPrefs()).toEqual({
      ...DEFAULT_SELECTION_PREFS,
      bubbleBg: '#111111',
    });
  });

  it('recovers custom themes when stored config is not an array', async () => {
    await repo.set('customThemes', { id: 'not-an-array' });

    expect(await svc.getCustomThemes()).toEqual([]);
  });
});
