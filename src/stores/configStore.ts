'use client';

/**
 * @fileoverview Zustand store wrapping `ConfigService` for UI reactivity.
 *
 * Single source of truth at component-tree level for theme, font prefs,
 * task routing, and monthly budget. All setters write through to
 * `ConfigService` so storage stays consistent with React state.
 *
 * Pattern:
 *   - On app boot: `useConfigStore.getState().hydrate()` reads all four
 *     keys from IndexedDB and populates the store
 *   - Components read with selectors: `useConfigStore(s => s.theme)`
 *   - Writes go through `setXxx()` async actions
 */

import { create } from 'zustand';
import type { TaskRouting } from '@/types/domain';
import type { Theme } from '@/types/theme';
import {
  ConfigService,
  DEFAULT_TASK_ROUTING,
  DEFAULT_FONT_PREFS,
  DEFAULT_THEME,
  DEFAULT_MONTHLY_BUDGET_CNY,
  DEFAULT_DAILY_READING_GOAL_MINUTES,
  DEFAULT_SELECTION_PREFS,
  DEFAULT_PROMPT_OVERRIDES,
  type FontPrefs,
  type ThemeConfig,
  type SelectionPrefs,
  type PromptOverrides,
} from '@/services/ConfigService';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { detectBrowserLocale, type Locale } from '@/lib/i18n';

interface ConfigState {
  theme: ThemeConfig;
  routing: TaskRouting;
  font: FontPrefs;
  budgetCNY: number;
  dailyReadingGoalMinutes: number;
  selectionPrefs: SelectionPrefs;
  promptOverrides: PromptOverrides;
  customThemes: Theme[];
  locale: Locale;
  localeOverride: Locale | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setTheme: (t: ThemeConfig) => Promise<void>;
  setRouting: (r: TaskRouting) => Promise<void>;
  setFont: (f: FontPrefs) => Promise<void>;
  setBudget: (n: number) => Promise<void>;
  setDailyReadingGoalMinutes: (n: number) => Promise<void>;
  setLocaleOverride: (locale: Locale | null) => Promise<void>;
  setSelectionPrefs: (p: SelectionPrefs) => Promise<void>;
  setPromptOverrides: (p: PromptOverrides) => Promise<void>;
  setCustomThemes: (themes: Theme[]) => Promise<void>;
}

const svc = new ConfigService(new IndexedDBConfigRepo());

type ConfigValues = Pick<
  ConfigState,
  | 'theme'
  | 'routing'
  | 'font'
  | 'budgetCNY'
  | 'dailyReadingGoalMinutes'
  | 'selectionPrefs'
  | 'promptOverrides'
  | 'customThemes'
  | 'locale'
  | 'localeOverride'
  | 'hydrated'
>;

function getInitialConfigValues(): ConfigValues {
  return {
    theme: DEFAULT_THEME,
    routing: DEFAULT_TASK_ROUTING,
    font: DEFAULT_FONT_PREFS,
    budgetCNY: DEFAULT_MONTHLY_BUDGET_CNY,
    dailyReadingGoalMinutes: DEFAULT_DAILY_READING_GOAL_MINUTES,
    selectionPrefs: DEFAULT_SELECTION_PREFS,
    promptOverrides: DEFAULT_PROMPT_OVERRIDES,
    customThemes: [],
    locale: 'zh',
    localeOverride: null,
    hydrated: false,
  };
}

/**
 * Resolves the effective locale from an explicit override + browser detection.
 * Override (if set) wins; otherwise we look at the navigator language.
 */
function resolveLocale(override: Locale | null): Locale {
  return override ?? detectBrowserLocale();
}

async function getConfigValue<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function normalizeDailyReadingGoalMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_DAILY_READING_GOAL_MINUTES;
  }

  return Math.max(0, Math.round(minutes));
}

function normalizeMonthlyBudgetCNY(amount: number): number {
  if (!Number.isFinite(amount)) {
    return DEFAULT_MONTHLY_BUDGET_CNY;
  }

  return Math.max(0, amount);
}

export const useConfigStore = create<ConfigState>(set => ({
  ...getInitialConfigValues(),

  hydrate: async () => {
    const [
      theme,
      routing,
      font,
      budgetCNY,
      dailyReadingGoalMinutes,
      localeOverride,
      selectionPrefs,
      promptOverrides,
      customThemes,
    ] =
      await Promise.all([
        getConfigValue(() => svc.getTheme(), DEFAULT_THEME),
        getConfigValue(() => svc.getTaskRouting(), DEFAULT_TASK_ROUTING),
        getConfigValue(() => svc.getFontPrefs(), DEFAULT_FONT_PREFS),
        getConfigValue(() => svc.getMonthlyBudgetCNY(), DEFAULT_MONTHLY_BUDGET_CNY),
        getConfigValue(
          () => svc.getDailyReadingGoalMinutes(),
          DEFAULT_DAILY_READING_GOAL_MINUTES,
        ),
        getConfigValue(() => svc.getLocaleOverride(), null),
        getConfigValue(() => svc.getSelectionPrefs(), DEFAULT_SELECTION_PREFS),
        getConfigValue(() => svc.getPromptOverrides(), DEFAULT_PROMPT_OVERRIDES),
        getConfigValue(() => svc.getCustomThemes(), []),
      ]);
    set({
      theme,
      routing,
      font,
      budgetCNY,
      dailyReadingGoalMinutes,
      selectionPrefs,
      promptOverrides,
      customThemes,
      localeOverride,
      locale: resolveLocale(localeOverride),
      hydrated: true,
    });
  },

  setTheme: async t => {
    await svc.setTheme(t);
    set({ theme: t });
  },
  setRouting: async r => {
    await svc.setTaskRouting(r);
    set({ routing: r });
  },
  setFont: async f => {
    await svc.setFontPrefs(f);
    set({ font: f });
  },
  setBudget: async n => {
    const budgetCNY = normalizeMonthlyBudgetCNY(n);
    await svc.setMonthlyBudgetCNY(budgetCNY);
    set({ budgetCNY });
  },
  setDailyReadingGoalMinutes: async n => {
    const dailyReadingGoalMinutes = normalizeDailyReadingGoalMinutes(n);
    await svc.setDailyReadingGoalMinutes(dailyReadingGoalMinutes);
    set({ dailyReadingGoalMinutes });
  },
  setLocaleOverride: async localeOverride => {
    await svc.setLocaleOverride(localeOverride);
    set({ localeOverride, locale: resolveLocale(localeOverride) });
  },
  setSelectionPrefs: async p => {
    await svc.setSelectionPrefs(p);
    set({ selectionPrefs: p });
  },
  setPromptOverrides: async p => {
    await svc.setPromptOverrides(p);
    set({ promptOverrides: p });
  },
  setCustomThemes: async themes => {
    await svc.setCustomThemes(themes);
    set({ customThemes: themes });
  },
}));

export function _resetConfigStoreForTests(): void {
  useConfigStore.setState(getInitialConfigValues());
}
