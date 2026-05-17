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
import {
  ConfigService,
  DEFAULT_TASK_ROUTING,
  DEFAULT_FONT_PREFS,
  DEFAULT_THEME,
  DEFAULT_MONTHLY_BUDGET_CNY,
  type FontPrefs,
  type ThemeConfig,
} from '@/services/ConfigService';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { detectBrowserLocale, type Locale } from '@/lib/i18n';

interface ConfigState {
  theme: ThemeConfig;
  routing: TaskRouting;
  font: FontPrefs;
  budgetCNY: number;
  /** Resolved locale (overrride if set, otherwise browser detect). */
  locale: Locale;
  /** User's explicit choice; null means "follow browser". */
  localeOverride: Locale | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setTheme: (t: ThemeConfig) => Promise<void>;
  setRouting: (r: TaskRouting) => Promise<void>;
  setFont: (f: FontPrefs) => Promise<void>;
  setBudget: (n: number) => Promise<void>;
  setLocaleOverride: (locale: Locale | null) => Promise<void>;
}

const svc = new ConfigService(new IndexedDBConfigRepo());

/**
 * Resolves the effective locale from an explicit override + browser detection.
 * Override (if set) wins; otherwise we look at the navigator language.
 */
function resolveLocale(override: Locale | null): Locale {
  return override ?? detectBrowserLocale();
}

export const useConfigStore = create<ConfigState>(set => ({
  theme: DEFAULT_THEME,
  routing: DEFAULT_TASK_ROUTING,
  font: DEFAULT_FONT_PREFS,
  budgetCNY: DEFAULT_MONTHLY_BUDGET_CNY,
  locale: 'zh',
  localeOverride: null,
  hydrated: false,

  hydrate: async () => {
    const [theme, routing, font, budgetCNY, localeOverride] = await Promise.all([
      svc.getTheme(),
      svc.getTaskRouting(),
      svc.getFontPrefs(),
      svc.getMonthlyBudgetCNY(),
      svc.getLocaleOverride(),
    ]);
    set({
      theme,
      routing,
      font,
      budgetCNY,
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
    await svc.setMonthlyBudgetCNY(n);
    set({ budgetCNY: n });
  },
  setLocaleOverride: async localeOverride => {
    await svc.setLocaleOverride(localeOverride);
    set({ localeOverride, locale: resolveLocale(localeOverride) });
  },
}));
