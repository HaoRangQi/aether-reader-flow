'use client';

/**
 * @fileoverview I18nProvider — syncs `<html lang>` with the active locale.
 *
 * The actual translation lookup is a plain function call (`t()`) returned
 * by `useT()`, so no React context is needed. We mount this component to:
 *   - Keep `document.documentElement.lang` in sync (a11y, browser
 *     hyphenation, screen readers)
 *
 * The locale itself lives in `configStore` and is hydrated by ConfigHydrator.
 */

import { useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { translate, type TKey } from '@/lib/i18n';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useConfigStore(s => s.locale);
  const hydrated = useConfigStore(s => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  }, [hydrated, locale]);

  return <>{children}</>;
}

/**
 * Returns a `t(key, params?)` function bound to the current locale.
 *
 * Why a hook + closure instead of context: simpler. Zustand selector
 * makes any consumer rerender on locale change automatically. No
 * provider needs to wrap the component tree for translation to work.
 */
export function useT() {
  const locale = useConfigStore(s => s.locale);
  return (key: TKey, params?: Record<string, string | number>) =>
    translate(locale, key, params);
}
