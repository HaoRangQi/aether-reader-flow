'use client';

/**
 * @fileoverview ThemePicker — full 6-pack grid + light/dark/auto switcher.
 *
 * Each card shows mini light + dark swatches with accent + success dots
 * so users see what they're choosing.
 */

import { useConfigStore } from '@/stores/configStore';
import { THEMES } from '@/lib/themes';
import type { ColorTokens } from '@/types/theme';
import clsx from 'clsx';

interface ThemeCardProps {
  id: string;
  name: string;
  tokens: { light: ColorTokens; dark: ColorTokens };
  selected: boolean;
  onClick: () => void;
}

function ThemeCard({ id, name, tokens, selected, onClick }: ThemeCardProps) {
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
      aria-label={`选择 ${name} 主题`}
      data-theme-id={id}
    >
      <div className="flex gap-2">
        <Swatch tokens={tokens.light} label="浅" />
        <Swatch tokens={tokens.dark} label="深" />
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
  const { theme, setTheme } = useConfigStore();

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">外观主题</h1>
      <p className="text-sm text-muted mb-8">
        每个主题包含浅色与深色两套配色，模式可独立切换。
      </p>

      <h3 className="text-sm text-muted mb-3">主题包</h3>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {THEMES.map(t => (
          <ThemeCard
            key={t.id}
            id={t.id}
            name={t.name}
            tokens={{ light: t.light, dark: t.dark }}
            selected={theme.id === t.id}
            onClick={() => void setTheme({ ...theme, id: t.id })}
          />
        ))}
      </div>

      <h3 className="text-sm text-muted mb-3">模式</h3>
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
            {m === 'light' ? '浅色' : m === 'dark' ? '深色' : '跟随系统'}
          </button>
        ))}
      </div>
    </div>
  );
}
