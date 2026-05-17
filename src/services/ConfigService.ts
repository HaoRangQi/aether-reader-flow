/**
 * @fileoverview ConfigService — top-level façade for user configuration.
 *
 * Wraps `ConfigRepo` with typed getters/setters and built-in defaults
 * for every config key. All UI code reads/writes via this service rather
 * than knowing the underlying key strings.
 *
 * P4 adds a Zustand store on top for component reactivity; in P2 we use
 * it directly from the (small number of) places that need it.
 *
 * Keys reserved:
 *   - theme:           ThemeConfig (P5 actually applies it)
 *   - taskRouting:     TaskRouting (P4 wires UI)
 *   - fontPrefs:       FontPrefs   (P4 wires UI)
 *   - monthlyBudgetCNY:number      (P4 wires UI)
 *
 * Future keys should be added here so all defaults live in one place.
 */
import type { ConfigRepo } from '@/adapters/storage/interfaces';
import type { ModelRef, TaskRouting } from '@/types/domain';
import type { ThemeMode } from '@/types/theme';
import type { Locale } from '@/lib/i18n';

export interface ThemeConfig {
  id: string;
  mode: ThemeMode;
}

export interface FontPrefs {
  family: 'default' | 'custom';
  customCSS: string;
  size: 14 | 17 | 20;
  lineHeight: 1.6 | 1.8 | 2.0;
}

const KEYS = {
  theme: 'theme',
  routing: 'taskRouting',
  font: 'fontPrefs',
  budgetCNY: 'monthlyBudgetCNY',
  /** null means "follow browser"; an explicit locale is the user's pin. */
  localeOverride: 'localeOverride',
} as const;

const DEFAULT_REF_SONNET: ModelRef = {
  serviceId: 'default-anthropic',
  modelId: 'claude-sonnet-4-6',
};
const DEFAULT_REF_HAIKU: ModelRef = {
  serviceId: 'default-anthropic',
  modelId: 'claude-haiku-4-5',
};

export const DEFAULT_TASK_ROUTING: TaskRouting = {
  translate: DEFAULT_REF_HAIKU,
  explain: DEFAULT_REF_SONNET,
  verify: DEFAULT_REF_SONNET,
  summarize: DEFAULT_REF_SONNET,
  chat: DEFAULT_REF_SONNET,
};

export const DEFAULT_FONT_PREFS: FontPrefs = {
  family: 'default',
  customCSS: '',
  size: 17,
  lineHeight: 1.8,
};

export const DEFAULT_THEME: ThemeConfig = { id: 'sheepskin', mode: 'auto' };

export const DEFAULT_MONTHLY_BUDGET_CNY = 300;

export class ConfigService {
  constructor(private repo: ConfigRepo) {}

  async getTheme(): Promise<ThemeConfig> {
    return (await this.repo.get<ThemeConfig>(KEYS.theme)) ?? DEFAULT_THEME;
  }
  async setTheme(t: ThemeConfig): Promise<void> {
    await this.repo.set(KEYS.theme, t);
  }

  async getTaskRouting(): Promise<TaskRouting> {
    return (await this.repo.get<TaskRouting>(KEYS.routing)) ?? DEFAULT_TASK_ROUTING;
  }
  async setTaskRouting(r: TaskRouting): Promise<void> {
    await this.repo.set(KEYS.routing, r);
  }

  async getFontPrefs(): Promise<FontPrefs> {
    return (await this.repo.get<FontPrefs>(KEYS.font)) ?? DEFAULT_FONT_PREFS;
  }
  async setFontPrefs(f: FontPrefs): Promise<void> {
    await this.repo.set(KEYS.font, f);
  }

  async getMonthlyBudgetCNY(): Promise<number> {
    return (await this.repo.get<number>(KEYS.budgetCNY)) ?? DEFAULT_MONTHLY_BUDGET_CNY;
  }
  async setMonthlyBudgetCNY(amt: number): Promise<void> {
    await this.repo.set(KEYS.budgetCNY, amt);
  }

  /**
   * Returns the user's explicit locale choice, or `null` if they want the
   * UI to follow the browser. Decoupled from the actual rendered locale —
   * the `I18nProvider` is in charge of combining this with browser detection.
   */
  async getLocaleOverride(): Promise<Locale | null> {
    return (await this.repo.get<Locale | null>(KEYS.localeOverride)) ?? null;
  }
  async setLocaleOverride(locale: Locale | null): Promise<void> {
    await this.repo.set(KEYS.localeOverride, locale);
  }
}
