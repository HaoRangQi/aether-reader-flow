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
 *   - dailyReadingGoalMinutes:number
 *
 * Future keys should be added here so all defaults live in one place.
 */
import type { ConfigRepo } from '@/adapters/storage/interfaces';
import type { ModelRef, TaskRouting } from '@/types/domain';
import type { ThemeMode, Theme } from '@/types/theme';
import type { Locale } from '@/lib/i18n';

export interface SelectionPrefs {
  /** CSS color string for the bubble background. Empty = use theme default. */
  bubbleBg: string;
  /** CSS color string for bubble text. Empty = use theme default. */
  bubbleText: string;
  /** CSS color string for button hover / accent. Empty = use theme default. */
  bubbleAccent: string;
  /** Width of the inline AI result panel. */
  resultWidth: 'compact' | 'normal' | 'wide';
}

/** Per-task system prompt overrides. Empty string = use built-in default. */
export interface PromptOverrides {
  translate: string;
  explain: string;
  verify: string;
  summarize: string;
  chat: string;
}

export interface ThemeConfig {
  id: string;
  mode: ThemeMode;
}

export interface FontPrefs {
  /** 'default' = built-in serif; 'system' = user-picked; 'custom' = raw CSS */
  readerFamily: 'default' | 'system' | 'custom';
  readerFontValue: string;
  readerSize: number;
  readerLineHeight: number;
  /** UI font — applies to the whole app shell. 'default' = built-in sans. */
  uiFamily: 'default' | 'system' | 'custom';
  uiFontValue: string;
}

const KEYS = {
  theme: 'theme',
  routing: 'taskRouting',
  font: 'fontPrefs',
  budgetCNY: 'monthlyBudgetCNY',
  localeOverride: 'localeOverride',
  selectionPrefs: 'selectionPrefs',
  promptOverrides: 'promptOverrides',
  customThemes: 'customThemes',
  dailyReadingGoalMinutes: 'dailyReadingGoalMinutes',
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
  readerFamily: 'default',
  readerFontValue: '',
  readerSize: 17,
  readerLineHeight: 1.8,
  uiFamily: 'default',
  uiFontValue: '',
};

export const DEFAULT_SELECTION_PREFS: SelectionPrefs = {
  bubbleBg: '',
  bubbleText: '',
  bubbleAccent: '',
  resultWidth: 'normal',
};

export const DEFAULT_PROMPT_OVERRIDES: PromptOverrides = {
  translate: '',
  explain: '',
  verify: '',
  summarize: '',
  chat: '',
};

export const DEFAULT_THEME: ThemeConfig = { id: 'sheepskin', mode: 'auto' };

export const DEFAULT_MONTHLY_BUDGET_CNY = 300;
export const DEFAULT_DAILY_READING_GOAL_MINUTES = 30;

const TASK_KEYS = ['translate', 'explain', 'verify', 'summarize', 'chat'] as const;
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'auto'];
const RESULT_WIDTHS: readonly SelectionPrefs['resultWidth'][] = ['compact', 'normal', 'wide'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.includes(value as ThemeMode);
}

function isModelRef(value: unknown): value is ModelRef {
  return (
    isRecord(value) &&
    typeof value.serviceId === 'string' &&
    value.serviceId.trim() !== '' &&
    typeof value.modelId === 'string' &&
    value.modelId.trim() !== ''
  );
}

function getNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function normalizeTheme(value: unknown): ThemeConfig {
  if (!isRecord(value)) return DEFAULT_THEME;

  return {
    id: typeof value.id === 'string' && value.id.trim() !== '' ? value.id : DEFAULT_THEME.id,
    mode: isThemeMode(value.mode) ? value.mode : DEFAULT_THEME.mode,
  };
}

function normalizeTaskRouting(value: unknown): TaskRouting {
  if (!isRecord(value)) return DEFAULT_TASK_ROUTING;

  return TASK_KEYS.reduce<TaskRouting>(
    (routing, key) => ({
      ...routing,
      [key]: isModelRef(value[key]) ? value[key] : DEFAULT_TASK_ROUTING[key],
    }),
    { ...DEFAULT_TASK_ROUTING },
  );
}

function normalizePromptOverrides(value: unknown): PromptOverrides {
  if (!isRecord(value)) return DEFAULT_PROMPT_OVERRIDES;

  return TASK_KEYS.reduce<PromptOverrides>(
    (overrides, key) => ({
      ...overrides,
      [key]: typeof value[key] === 'string' ? value[key] : DEFAULT_PROMPT_OVERRIDES[key],
    }),
    { ...DEFAULT_PROMPT_OVERRIDES },
  );
}

function normalizeSelectionPrefs(value: unknown): SelectionPrefs {
  if (!isRecord(value)) return DEFAULT_SELECTION_PREFS;

  return {
    bubbleBg: typeof value.bubbleBg === 'string' ? value.bubbleBg : DEFAULT_SELECTION_PREFS.bubbleBg,
    bubbleText:
      typeof value.bubbleText === 'string' ? value.bubbleText : DEFAULT_SELECTION_PREFS.bubbleText,
    bubbleAccent:
      typeof value.bubbleAccent === 'string'
        ? value.bubbleAccent
        : DEFAULT_SELECTION_PREFS.bubbleAccent,
    resultWidth: RESULT_WIDTHS.includes(value.resultWidth as SelectionPrefs['resultWidth'])
      ? (value.resultWidth as SelectionPrefs['resultWidth'])
      : DEFAULT_SELECTION_PREFS.resultWidth,
  };
}

export class ConfigService {
  constructor(private repo: ConfigRepo) {}

  async getTheme(): Promise<ThemeConfig> {
    return normalizeTheme(await this.repo.get(KEYS.theme));
  }
  async setTheme(t: ThemeConfig): Promise<void> {
    await this.repo.set(KEYS.theme, t);
  }

  async getTaskRouting(): Promise<TaskRouting> {
    return normalizeTaskRouting(await this.repo.get(KEYS.routing));
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
    return getNonNegativeNumber(await this.repo.get(KEYS.budgetCNY), DEFAULT_MONTHLY_BUDGET_CNY);
  }
  async setMonthlyBudgetCNY(amt: number): Promise<void> {
    await this.repo.set(KEYS.budgetCNY, amt);
  }

  async getDailyReadingGoalMinutes(): Promise<number> {
    return getNonNegativeInteger(
      await this.repo.get(KEYS.dailyReadingGoalMinutes),
      DEFAULT_DAILY_READING_GOAL_MINUTES,
    );
  }
  async setDailyReadingGoalMinutes(minutes: number): Promise<void> {
    await this.repo.set(KEYS.dailyReadingGoalMinutes, Math.max(0, Math.round(minutes)));
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

  async getSelectionPrefs(): Promise<SelectionPrefs> {
    return normalizeSelectionPrefs(await this.repo.get(KEYS.selectionPrefs));
  }
  async setSelectionPrefs(p: SelectionPrefs): Promise<void> {
    await this.repo.set(KEYS.selectionPrefs, p);
  }

  async getPromptOverrides(): Promise<PromptOverrides> {
    return normalizePromptOverrides(await this.repo.get(KEYS.promptOverrides));
  }
  async setPromptOverrides(p: PromptOverrides): Promise<void> {
    await this.repo.set(KEYS.promptOverrides, p);
  }

  async getCustomThemes(): Promise<Theme[]> {
    const themes = await this.repo.get(KEYS.customThemes);
    return Array.isArray(themes) ? themes : [];
  }
  async setCustomThemes(themes: Theme[]): Promise<void> {
    await this.repo.set(KEYS.customThemes, themes);
  }
}
