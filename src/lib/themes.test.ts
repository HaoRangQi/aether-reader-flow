import { describe, it, expect } from 'vitest';
import { THEMES, getTheme } from './themes';

const REQUIRED_KEYS = [
  'background',
  'surface',
  'surfaceElevated',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentHover',
  'selection',
  'success',
  'warning',
  'danger',
  'info',
  'border',
  'divider',
  'glassOverlay',
  'glassBorder',
  'glassGlow',
] as const;

describe('themes', () => {
  it('exposes built-in themes with required ids', () => {
    const ids = THEMES.map(t => t.id).sort();
    expect(ids).toEqual([
      'bamboo',
      'lotus',
      'maple',
      'newsprint',
      'ocean',
      'sheepskin',
      'sprout',
    ]);
  });

  it('every theme has light and dark with all required keys', () => {
    for (const t of THEMES) {
      for (const mode of ['light', 'dark'] as const) {
        for (const key of REQUIRED_KEYS) {
          const v = t[mode][key];
          expect(v, `${t.id}.${mode}.${key}`).toBeTruthy();
        }
      }
    }
  });

  it('getTheme returns the named theme', () => {
    expect(getTheme('maple').name).toBe('枫丹');
    expect(getTheme('bamboo').name).toBe('竹翠');
  });

  it('getTheme normalizes whitespace and casing for durable config ids', () => {
    expect(getTheme('  MAPLE  ').name).toBe('枫丹');
    expect(getTheme('\nBamboo\t').name).toBe('竹翠');
  });

  it('getTheme falls back for blank or non-string runtime ids', () => {
    expect(getTheme('   ').id).toBe('sheepskin');
    expect(getTheme(undefined).id).toBe('sheepskin');
    expect(getTheme(42).id).toBe('sheepskin');
  });

  it('getTheme normalizes custom theme ids without mutating the returned theme', () => {
    const custom = {
      ...THEMES[0],
      id: 'Custom-Pack',
      name: '自定义主题',
    };

    expect(getTheme(' custom-pack ', [custom])).toBe(custom);
    expect(custom.id).toBe('Custom-Pack');
  });

  it('getTheme skips invalid custom theme entries', () => {
    const custom = {
      ...THEMES[0],
      id: 'Custom-Pack',
      name: '自定义主题',
    };
    const corruptedCustomThemes = [
      null,
      { id: 42 },
      { id: 'broken' },
      custom,
    ];

    expect(getTheme(' custom-pack ', corruptedCustomThemes)).toBe(custom);
    expect(getTheme('broken', corruptedCustomThemes).id).toBe('sheepskin');
  });

  it('getTheme falls back to sheepskin for unknown ids', () => {
    expect(getTheme('nonexistent').id).toBe('sheepskin');
  });

  it('themes have human-readable Chinese names', () => {
    expect(THEMES.find(t => t.id === 'sheepskin')?.name).toBe('羊皮纸');
    expect(THEMES.find(t => t.id === 'newsprint')?.name).toBe('报刊');
    expect(THEMES.find(t => t.id === 'ocean')?.name).toBe('远海');
  });
});
