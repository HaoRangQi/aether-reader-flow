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
  it('exposes exactly 6 themes with required ids', () => {
    const ids = THEMES.map(t => t.id).sort();
    expect(ids).toEqual([
      'bamboo',
      'lotus',
      'maple',
      'newsprint',
      'ocean',
      'sheepskin',
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

  it('getTheme falls back to sheepskin for unknown ids', () => {
    expect(getTheme('nonexistent').id).toBe('sheepskin');
  });

  it('themes have human-readable Chinese names', () => {
    expect(THEMES.find(t => t.id === 'sheepskin')?.name).toBe('羊皮纸');
    expect(THEMES.find(t => t.id === 'newsprint')?.name).toBe('报刊');
    expect(THEMES.find(t => t.id === 'ocean')?.name).toBe('远海');
  });
});
