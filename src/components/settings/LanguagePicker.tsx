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
import { useConfigStore } from '@/stores/configStore';
import { useT } from '@/components/shared/I18nProvider';
import {
  SUPPORTED_LOCALES,
  LOCALE_LABEL,
  detectBrowserLocale,
  type Locale,
} from '@/lib/i18n';

export function LanguagePicker() {
  const t = useT();
  const localeOverride = useConfigStore(s => s.localeOverride);
  const setLocaleOverride = useConfigStore(s => s.setLocaleOverride);

  const browserLocale = detectBrowserLocale();

  const onPick = (choice: Locale | null) => {
    void setLocaleOverride(choice);
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">{t('settings.language.title')}</h1>
      <p className="text-sm text-muted mb-8">
        {t('settings.language.description')}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onPick(null)}
          className={clsx(
            'px-4 py-2 text-sm rounded-md transition',
            localeOverride === null
              ? 'bg-accent text-white'
              : 'border border-border text-foreground hover:bg-surface-elevated',
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
            onClick={() => onPick(l)}
            className={clsx(
              'px-4 py-2 text-sm rounded-md transition',
              localeOverride === l
                ? 'bg-accent text-white'
                : 'border border-border text-foreground hover:bg-surface-elevated',
            )}
            aria-pressed={localeOverride === l}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
