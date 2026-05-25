'use client';

import { useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { THEMES } from '@/lib/themes';
import type { ColorTokens, Theme } from '@/types/theme';
import { useT } from '@/components/shared/I18nProvider';
import clsx from 'clsx';

// The subset of ColorTokens exposed in the custom theme editor
const EDITABLE_TOKENS: { key: keyof ColorTokens; label: string }[] = [
  { key: 'background', label: '页面背景' },
  { key: 'surface', label: '卡片背景' },
  { key: 'text', label: '正文颜色' },
  { key: 'textMuted', label: '次要文字' },
  { key: 'accent', label: '强调色' },
  { key: 'accentHover', label: '强调色悬停' },
  { key: 'selection', label: '划词高亮' },
  { key: 'border', label: '边框' },
  { key: 'glassOverlay', label: '气泡背景' },
];

function makeDefaultTokens(base: ColorTokens, overrides: Partial<ColorTokens>): ColorTokens {
  return { ...base, ...overrides };
}

const BLANK_LIGHT: ColorTokens = {
  background: '#FFFFFF', surface: '#F5F5F5', surfaceElevated: '#EEEEEE',
  text: '#1A1A1A', textMuted: '#555555', textSubtle: '#888888',
  accent: '#4A90D9', accentHover: '#357ABD', selection: 'rgba(74,144,217,0.22)',
  success: '#4A7C59', warning: '#C49A3C', danger: '#B33E2A', info: '#5B7A96',
  border: 'rgba(0,0,0,0.10)', divider: 'rgba(0,0,0,0.05)',
  glassOverlay: 'rgba(255,255,255,0.75)', glassBorder: 'rgba(0,0,0,0.08)', glassGlow: 'rgba(74,144,217,0.14)',
};
const BLANK_DARK: ColorTokens = {
  background: '#1A1A1A', surface: '#242424', surfaceElevated: '#2E2E2E',
  text: '#E8E8E8', textMuted: '#AAAAAA', textSubtle: '#777777',
  accent: '#6AABF0', accentHover: '#80BEFF', selection: 'rgba(106,171,240,0.28)',
  success: '#6FA67D', warning: '#D4B257', danger: '#D55E47', info: '#8FA8C0',
  border: 'rgba(255,255,255,0.10)', divider: 'rgba(255,255,255,0.05)',
  glassOverlay: 'rgba(20,20,20,0.65)', glassBorder: 'rgba(255,255,255,0.10)', glassGlow: 'rgba(106,171,240,0.18)',
};

function Swatch({ tokens, label }: { tokens: ColorTokens; label: string }) {
  return (
    <div className="flex-1 h-16 rounded-md p-2 flex flex-col justify-between"
      style={{ background: tokens.background, color: tokens.text }}>
      <span className="text-xs">{label}</span>
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.accent }} />
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.success }} />
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.danger }} />
      </div>
    </div>
  );
}

function ThemeCard({ theme, selected, onClick, onEdit, onDelete, swatchLabels }: {
  theme: Theme; selected: boolean; onClick: () => void;
  onEdit?: () => void; onDelete?: () => void;
  swatchLabels: { light: string; dark: string };
}) {
  return (
    <div className={clsx(
      'flex flex-col gap-2 rounded-lg p-3 border-2 transition',
      selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-muted',
    )}>
      <button
        type="button"
        onClick={onClick}
        className="flex gap-2 text-left w-full"
        aria-label={`选择主题：${theme.name}`}
      >
        <Swatch tokens={theme.light} label={swatchLabels.light} />
        <Swatch tokens={theme.dark} label={swatchLabels.dark} />
      </button>
      <div className="flex items-center justify-between">
        <span className="font-serif text-sm text-foreground">{theme.name}</span>
        {(onEdit || onDelete) && (
          <div className="flex gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded transition"
                aria-label={`编辑主题：${theme.name}`}
              >
                编辑
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-xs text-muted hover:text-danger px-1.5 py-0.5 rounded transition"
                aria-label={`删除主题：${theme.name}`}
              >
                删除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenEditor({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-20 shrink-0">{label}</span>
      <input type="color" value={value.startsWith('#') ? value : '#888888'}
        aria-label={`${label}颜色选择`}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent shrink-0" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        aria-label={`${label}颜色值`}
        className="flex-1 px-2 py-1 text-xs rounded border border-border bg-surface text-foreground font-mono focus:outline-none focus:border-accent" />
    </div>
  );
}

function CustomThemeEditor({ initial, onSave, onCancel }: {
  initial?: Theme;
  onSave: (t: Theme) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [light, setLight] = useState<ColorTokens>(initial?.light ?? BLANK_LIGHT);
  const [dark, setDark] = useState<ColorTokens>(initial?.dark ?? BLANK_DARK);
  const [tab, setTab] = useState<'light' | 'dark'>('light');

  const tokens = tab === 'light' ? light : dark;
  const setToken = (key: keyof ColorTokens, val: string) => {
    if (tab === 'light') setLight(prev => ({ ...prev, [key]: val }));
    else setDark(prev => ({ ...prev, [key]: val }));
  };

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? `custom-${Date.now()}`,
      name: name.trim(),
      light: makeDefaultTokens(BLANK_LIGHT, light),
      dark: makeDefaultTokens(BLANK_DARK, dark),
    });
  };

  return (
    <div className="border border-border rounded-xl p-4 bg-surface space-y-4">
      <div className="flex items-center gap-3">
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          aria-label="主题名称"
          placeholder="主题名称"
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:border-accent" />
        <div className="flex gap-1">
          {(['light', 'dark'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${tab === t ? 'bg-accent text-white' : 'border border-border text-muted hover:text-foreground'}`}>
              {t === 'light' ? '浅色' : '深色'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {EDITABLE_TOKENS.map(({ key, label }) => (
          <TokenEditor key={key} label={label} value={tokens[key]}
            onChange={v => setToken(key, v)} />
        ))}
      </div>

      {/* Live preview */}
      <div className="flex gap-2 h-14 rounded-lg overflow-hidden border border-border">
        <Swatch tokens={light} label="浅" />
        <Swatch tokens={dark} label="深" />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={!name.trim()}
          className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition disabled:opacity-40">
          保存主题
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-muted hover:text-foreground transition">
          取消
        </button>
      </div>
    </div>
  );
}

export function ThemePicker() {
  const t = useT();
  const { theme, setTheme, customThemes, setCustomThemes } = useConfigStore();
  const [editing, setEditing] = useState<Theme | null | 'new'>(null);
  const [error, setError] = useState<string | null>(null);

  const swatchLabels = {
    light: t('settings.theme.mode.light').slice(0, 1),
    dark: t('settings.theme.mode.dark').slice(0, 1),
  };

  const saveCustom = async (updated: Theme) => {
    const exists = customThemes.find(c => c.id === updated.id);
    const hasDuplicateName = customThemes.some(c =>
      c.id !== updated.id && c.name.trim().toLowerCase() === updated.name.trim().toLowerCase()
    );
    if (hasDuplicateName) {
      setError(`已存在名为“${updated.name.trim()}”的自定义主题。`);
      return;
    }
    const next = exists
      ? customThemes.map(c => c.id === updated.id ? updated : c)
      : [...customThemes, updated];
    setError(null);
    try {
      await setCustomThemes(next);
      // Auto-select the new/edited theme
      void setTheme({ ...theme, id: updated.id });
      setEditing(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`自定义主题保存失败：${message}`);
    }
  };

  const deleteCustom = async (id: string) => {
    setError(null);
    try {
      await setCustomThemes(customThemes.filter(c => c.id !== id));
      if (theme.id === id) void setTheme({ ...theme, id: 'sheepskin' });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
      setError(`自定义主题删除失败：${message}`);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">{t('settings.theme.title')}</h1>
      <p className="text-sm text-muted mb-8">{t('settings.theme.description')}</p>

      {/* Built-in themes */}
      <h3 className="text-sm text-muted mb-3">{t('settings.theme.packs')}</h3>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {THEMES.map(th => (
          <ThemeCard key={th.id} theme={th} selected={theme.id === th.id}
            onClick={() => void setTheme({ ...theme, id: th.id })}
            swatchLabels={swatchLabels} />
        ))}
      </div>

      {/* Custom themes */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted">自定义主题</h3>
        {editing === null && (
          <button type="button" onClick={() => setEditing('new')}
            className="text-xs px-3 py-1 rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition">
            + 新建
          </button>
        )}
      </div>

      {customThemes.length > 0 && editing === null && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {customThemes.map(th => (
            <ThemeCard key={th.id} theme={th} selected={theme.id === th.id}
              onClick={() => void setTheme({ ...theme, id: th.id })}
              onEdit={() => setEditing(th)}
              onDelete={() => void deleteCustom(th.id)}
              swatchLabels={swatchLabels} />
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {editing !== null && (
        <div className="mb-6">
          <CustomThemeEditor
            initial={editing === 'new' ? undefined : editing}
            onSave={saveCustom}
            onCancel={() => setEditing(null)} />
        </div>
      )}

      {/* Mode switcher */}
      <h3 className="text-sm text-muted mb-3">{t('settings.theme.mode')}</h3>
      <div className="flex gap-2">
        {(['light', 'dark', 'auto'] as const).map(m => (
          <button key={m} type="button" onClick={() => void setTheme({ ...theme, mode: m })}
            className={clsx('px-4 py-2 text-sm rounded-md transition',
              theme.mode === m ? 'bg-accent text-white' : 'border border-border text-foreground hover:bg-surface-elevated')}
            aria-pressed={theme.mode === m}>
            {m === 'light' ? t('settings.theme.mode.light')
              : m === 'dark' ? t('settings.theme.mode.dark')
              : t('settings.theme.mode.auto')}
          </button>
        ))}
      </div>
    </div>
  );
}
