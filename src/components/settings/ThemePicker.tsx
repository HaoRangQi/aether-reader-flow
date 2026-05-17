'use client';

/**
 * ThemePicker — minimal P4 version. P5 will replace with a 6-theme-pack
 * grid + preview thumbnails. For now we only expose light/dark/auto mode.
 */
import { useConfigStore } from '@/stores/configStore';
import clsx from 'clsx';

export function ThemePicker() {
  const { theme, setTheme } = useConfigStore();
  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">外观主题</h1>
      <p className="text-sm text-muted mb-8">
        6 个预置主题包（含中国传统色）将在打磨阶段（P5）完成。当前可切换明暗。
      </p>

      <div className="flex gap-2">
        {(['light', 'dark', 'auto'] as const).map(m => (
          <button
            key={m}
            onClick={() => setTheme({ id: theme.id, mode: m })}
            className={clsx(
              'px-4 py-2 text-sm rounded-md transition',
              theme.mode === m
                ? 'bg-accent text-white'
                : 'border border-border text-foreground hover:bg-surface-elevated',
            )}
          >
            {m === 'light' ? '浅色' : m === 'dark' ? '深色' : '跟随系统'}
          </button>
        ))}
      </div>
    </div>
  );
}
