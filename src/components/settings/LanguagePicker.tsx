'use client';

/**
 * @fileoverview LanguagePicker — settings section for UI language.
 *
 * UX:
 *   - Default state: "follow browser" — shown as the currently-detected
 *     locale in subtle text.
 *   - Three buttons: follow-browser / 简体中文 / English.
 *   - Click any → write to ConfigService (or null for browser-follow),
 *     UI re-renders immediately because configStore is reactive.
 */

import clsx from 'clsx';
import { useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { useT } from '@/components/shared/I18nProvider';
import {
  SUPPORTED_LOCALES,
  LOCALE_LABEL,
  detectBrowserLocale,
  type Locale,
} from '@/lib/i18n';

function formatSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `语言设置保存失败：${message}`;
}

export function LanguagePicker() {
  const t = useT();
  const localeOverride = useConfigStore(s => s.localeOverride);
  const setLocaleOverride = useConfigStore(s => s.setLocaleOverride);
  const [pendingChoice, setPendingChoice] = useState<Locale | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const browserLocale = detectBrowserLocale();
  const autoLabel = `${t('settings.language.auto')} (${LOCALE_LABEL[browserLocale]})`;
  const selectedLabel = localeOverride === null
    ? autoLabel
    : LOCALE_LABEL[localeOverride];
  const isSaving = pendingChoice !== undefined;

  const onPick = async (choice: Locale | null) => {
    if (isSaving) return;

    setPendingChoice(choice);
    setError(null);
    try {
      await setLocaleOverride(choice);
    } catch (saveError) {
      setError(formatSaveError(saveError));
    } finally {
      setPendingChoice(undefined);
    }
  };

  return (
    <div>
      <h1 id="language-picker-title" className="font-serif text-2xl mb-2">
        {t('settings.language.title')}
      </h1>
      <p className="text-sm text-muted mb-8">
        {t('settings.language.description')}
      </p>

      <div
        role="group"
        aria-labelledby="language-picker-title"
        aria-describedby="language-picker-status"
        aria-busy={isSaving}
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          onClick={() => void onPick(null)}
          disabled={isSaving}
          className={clsx(
            'px-4 py-2 text-sm rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            localeOverride === null
              ? 'bg-accent text-white'
              : 'border border-border text-foreground hover:bg-surface-elevated',
            isSaving && 'opacity-60 cursor-not-allowed',
          )}
          aria-pressed={localeOverride === null}
        >
          {t('settings.language.auto')}
          <span className="ml-2 text-xs opacity-70">
            ({LOCALE_LABEL[browserLocale]})
          </span>
        </button>

        {SUPPORTED_LOCALES.map(l => (
          <button
            key={l}
            type="button"
            onClick={() => void onPick(l)}
            disabled={isSaving}
            className={clsx(
              'px-4 py-2 text-sm rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              localeOverride === l
                ? 'bg-accent text-white'
                : 'border border-border text-foreground hover:bg-surface-elevated',
              isSaving && 'opacity-60 cursor-not-allowed',
            )}
            aria-pressed={localeOverride === l}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>
      <p id="language-picker-status" role="status" aria-live="polite" className="sr-only">
        {isSaving ? '正在保存语言设置…' : selectedLabel}
      </p>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
