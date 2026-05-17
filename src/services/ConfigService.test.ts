import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import {
  ConfigService,
  DEFAULT_TASK_ROUTING,
  DEFAULT_FONT_PREFS,
  DEFAULT_THEME,
  DEFAULT_MONTHLY_BUDGET_CNY,
} from './ConfigService';

describe('ConfigService', () => {
  let svc: ConfigService;

  beforeEach(async () => {
    await resetDb();
    svc = new ConfigService(new IndexedDBConfigRepo());
  });

  it('returns defaults when nothing is set', async () => {
    expect(await svc.getTheme()).toEqual(DEFAULT_THEME);
    expect(await svc.getTaskRouting()).toEqual(DEFAULT_TASK_ROUTING);
    expect(await svc.getFontPrefs()).toEqual(DEFAULT_FONT_PREFS);
    expect(await svc.getMonthlyBudgetCNY()).toBe(DEFAULT_MONTHLY_BUDGET_CNY);
  });

  it('persists and retrieves theme', async () => {
    await svc.setTheme({ id: 'maple', mode: 'dark' });
    expect(await svc.getTheme()).toEqual({ id: 'maple', mode: 'dark' });
  });

  it('persists task routing', async () => {
    const routing = {
      ...DEFAULT_TASK_ROUTING,
      translate: { serviceId: 's1', modelId: 'claude-haiku-4-5' },
    };
    await svc.setTaskRouting(routing);
    expect(await svc.getTaskRouting()).toEqual(routing);
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

  it('returns null locale override by default (follow browser)', async () => {
    expect(await svc.getLocaleOverride()).toBeNull();
  });

  it('persists locale override', async () => {
    await svc.setLocaleOverride('en');
    expect(await svc.getLocaleOverride()).toBe('en');
    await svc.setLocaleOverride(null);
    expect(await svc.getLocaleOverride()).toBeNull();
  });
});
