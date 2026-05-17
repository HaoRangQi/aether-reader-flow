'use client';

/**
 * @fileoverview ThemePicker — full 6-pack grid + light/dark/auto switcher.
 */

import { useConfigStore } from '@/stores/configStore';
import { THEMES } from '@/lib/themes';
import type { ColorTokens } from '@/types/theme';
import { useT } from '@/components/shared/I18nProvider';
import clsx from 'clsx';

interface ThemeCardProps {
  id: string;
  name: string;
  tokens: { light: ColorTokens; dark: ColorTokens };
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
  labels: { light: string; dark: string };
}

function ThemeCard({
  id,
  name,
  tokens,
  selected,
  onClick,
  ariaLabel,
  labels,
}: ThemeCardProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col gap-2 rounded-lg p-3 border-2 transition text-left',
        selected
          ? 'border-accent ring-2 ring-[var(--color-accent)]/30'
          : 'border-border hover:border-muted',
      )}
      aria-pressed={selected}
      aria-label={ariaLabel}
      data-theme-id={id}
    >
      <div className="flex gap-2">
        <Swatch tokens={tokens.light} label={labels.light} />
        <Swatch tokens={tokens.dark} label={labels.dark} />
      </div>
      <div className="font-serif text-sm text-foreground">{name}</div>
    </button>
  );
}

function Swatch({ tokens, label }: { tokens: ColorTokens; label: string }) {
  return (
    <div
      className="flex-1 h-16 rounded-md p-2 flex flex-col justify-between"
      style={{ background: tokens.background, color: tokens.text }}
    >
      <span className="text-xs">{label}</span>
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.accent }} />
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.success }} />
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.danger }} />
      </div>
    </div>
  );
}

export function ThemePicker() {
  const t = useT();
  const { theme, setTheme } = useConfigStore();
  // For en locale we want short labels "L"/"D"; zh keeps 浅/深
  const swatchLabels = {
    light: t('settings.theme.mode.light').slice(0, 1),
    dark: t('settings.theme.mode.dark').slice(0, 1),
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">{t('settings.theme.title')}</h1>
      <p className="text-sm text-muted mb-8">{t('settings.theme.description')}</p>

      <h3 className="text-sm text-muted mb-3">{t('settings.theme.packs')}</h3>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {THEMES.map(th => (
          <ThemeCard
            key={th.id}
            id={th.id}
            name={th.name}
            tokens={{ light: th.light, dark: th.dark }}
            selected={theme.id === th.id}
            onClick={() => void setTheme({ ...theme, id: th.id })}
            ariaLabel={`${t('settings.theme.packs')}: ${th.name}`}
            labels={swatchLabels}
          />
        ))}
      </div>

      <h3 className="text-sm text-muted mb-3">{t('settings.theme.mode')}</h3>
      <div className="flex gap-2">
        {(['light', 'dark', 'auto'] as const).map(m => (
          <button
            key={m}
            onClick={() => void setTheme({ ...theme, mode: m })}
            className={clsx(
              'px-4 py-2 text-sm rounded-md transition',
              theme.mode === m
                ? 'bg-accent text-white'
                : 'border border-border text-foreground hover:bg-surface-elevated',
            )}
            aria-pressed={theme.mode === m}
          >
            {m === 'light'
              ? t('settings.theme.mode.light')
              : m === 'dark'
                ? t('settings.theme.mode.dark')
                : t('settings.theme.mode.auto')}
          </button>
        ))}
      </div>
    </div>
  );
}
