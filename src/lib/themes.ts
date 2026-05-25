/**
 * @fileoverview Six pre-built theme packs.
 *
 * Each pack defines both `light` and `dark` `ColorTokens`. Picked from
 * the spec's §7.2 catalog:
 *
 *   - 羊皮纸 (sheepskin) — default, warm paper, brown accent
 *   - 报刊 (newsprint) — newspaper white + ink red
 *   - 远海 (ocean) — pale blue mist + deep sea
 *   - 莲青 (lotus) — Chinese traditional lotus green-blue
 *   - 枫丹 (maple) — Chinese traditional maple red
 *   - 竹翠 (bamboo) — Chinese traditional bamboo green
 *
 * Hex values come straight from spec §7.2.1. If you tweak values, update
 * the spec first — these are the canonical numbers.
 */
import type { Theme, ColorTokens } from '@/types/theme';

function mk(
  bg: string,
  surface: string,
  surfaceEl: string,
  text: string,
  textMuted: string,
  textSubtle: string,
  accent: string,
  accentHover: string,
  selection: string,
  border: string,
  divider: string,
  glassOverlay: string,
  glassBorder: string,
  glassGlow: string,
): ColorTokens {
  return {
    background: bg,
    surface,
    surfaceElevated: surfaceEl,
    text,
    textMuted,
    textSubtle,
    accent,
    accentHover,
    selection,
    // Status colors are identical across packs for now; if a pack needs
    // different verdict colors we can extend mk() later.
    success: '#4A7C59',
    warning: '#C49A3C',
    danger: '#B33E2A',
    info: '#5B7A96',
    border,
    divider,
    glassOverlay,
    glassBorder,
    glassGlow,
  };
}

export const THEMES: Theme[] = [
  {
    id: 'sheepskin',
    name: '羊皮纸',
    light: mk(
      '#FAF8F4', '#FFFFFF', '#FFFFFF',
      '#2C2A28', '#5C5650', '#8A847C',
      '#C8783F', '#B36830', 'rgba(200,120,60,0.22)',
      'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.04)',
      'rgba(255,255,255,0.72)', 'rgba(0,0,0,0.06)', 'rgba(200,120,60,0.12)',
    ),
    dark: mk(
      '#1A1714', '#221F1B', '#2A2622',
      '#E8E4DE', '#B5AEA4', '#7A736A',
      '#D88F58', '#E9A06A', 'rgba(216,143,88,0.28)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(20,18,16,0.6)', 'rgba(255,255,255,0.08)', 'rgba(216,143,88,0.18)',
    ),
  },
  {
    id: 'newsprint',
    name: '报刊',
    light: mk(
      '#F5F2EC', '#FFFFFF', '#FFFFFF',
      '#1A1A18', '#4A4A48', '#8A8A88',
      '#A02C2C', '#8B2424', 'rgba(160,44,44,0.18)',
      'rgba(0,0,0,0.09)', 'rgba(0,0,0,0.04)',
      'rgba(255,255,255,0.78)', 'rgba(0,0,0,0.06)', 'rgba(160,44,44,0.10)',
    ),
    dark: mk(
      '#0E0D0B', '#1A1916', '#22201D',
      '#E8E5DF', '#B5B1A8', '#7A766E',
      '#D4604E', '#E07260', 'rgba(212,96,78,0.28)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(14,13,11,0.7)', 'rgba(255,255,255,0.08)', 'rgba(212,96,78,0.18)',
    ),
  },
  {
    id: 'ocean',
    name: '远海',
    light: mk(
      '#F0F4F7', '#FFFFFF', '#FFFFFF',
      '#1F2A36', '#4A5868', '#7A8898',
      '#5B7A96', '#4A6884', 'rgba(91,122,150,0.20)',
      'rgba(31,42,54,0.10)', 'rgba(31,42,54,0.04)',
      'rgba(255,255,255,0.75)', 'rgba(31,42,54,0.06)', 'rgba(91,122,150,0.14)',
    ),
    dark: mk(
      '#0A1620', '#10202C', '#162834',
      '#D4E4F2', '#9AB0C4', '#6A8098',
      '#9AB8D0', '#B0CCE0', 'rgba(154,184,208,0.28)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(10,22,32,0.7)', 'rgba(255,255,255,0.08)', 'rgba(154,184,208,0.18)',
    ),
  },
  {
    id: 'lotus',
    name: '莲青',
    light: mk(
      '#F6F4F0', '#FFFFFF', '#FFFFFF',
      '#2A2E36', '#525866', '#7E848E',
      '#5C7896', '#4A6680', 'rgba(92,120,150,0.20)',
      'rgba(42,46,54,0.08)', 'rgba(42,46,54,0.04)',
      'rgba(255,255,255,0.72)', 'rgba(42,46,54,0.06)', 'rgba(92,120,150,0.14)',
    ),
    dark: mk(
      '#1B2330', '#222A38', '#293242',
      '#D6DDE8', '#9DA8B8', '#6E7888',
      '#8AABCC', '#A0C0DE', 'rgba(138,171,204,0.28)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(27,35,48,0.7)', 'rgba(255,255,255,0.08)', 'rgba(138,171,204,0.18)',
    ),
  },
  {
    id: 'maple',
    name: '枫丹',
    light: mk(
      '#F8F4ED', '#FFFFFF', '#FFFFFF',
      '#2A1F1B', '#56463E', '#867466',
      '#B33E2A', '#9C3324', 'rgba(179,62,42,0.20)',
      'rgba(42,31,27,0.09)', 'rgba(42,31,27,0.04)',
      'rgba(255,255,255,0.72)', 'rgba(42,31,27,0.06)', 'rgba(179,62,42,0.14)',
    ),
    dark: mk(
      '#1F1612', '#26201A', '#2D2620',
      '#EAE0D4', '#B5A89A', '#7A6F62',
      '#D55E47', '#E37260', 'rgba(213,94,71,0.28)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(31,22,18,0.7)', 'rgba(255,255,255,0.08)', 'rgba(213,94,71,0.18)',
    ),
  },
  {
    id: 'bamboo',
    name: '竹翠',
    light: mk(
      '#F2F5EE', '#FFFFFF', '#FFFFFF',
      '#1F2A1A', '#48564A', '#788870',
      '#5B7A4E', '#496840', 'rgba(91,122,78,0.20)',
      'rgba(31,42,26,0.08)', 'rgba(31,42,26,0.04)',
      'rgba(255,255,255,0.72)', 'rgba(31,42,26,0.06)', 'rgba(91,122,78,0.14)',
    ),
    dark: mk(
      '#0E1A14', '#142220', '#1A2A24',
      '#D8E2D2', '#A0B098', '#707D68',
      '#8AAA78', '#A0BE90', 'rgba(138,170,120,0.28)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(14,26,20,0.7)', 'rgba(255,255,255,0.08)', 'rgba(138,170,120,0.18)',
    ),
  },
  {
    id: 'sprout',
    name: '豆芽绿',
    light: mk(
      '#E7F1DE', '#EDF4E6', '#F2F7ED',
      '#1E2A1A', '#465844', '#6F7F6A',
      '#52783D', '#456736', 'rgba(82,120,61,0.14)',
      'rgba(30,42,26,0.08)', 'rgba(30,42,26,0.04)',
      'rgba(231,241,222,0.88)', 'rgba(30,42,26,0.06)', 'rgba(82,120,61,0.08)',
    ),
    dark: mk(
      '#0F180D', '#162214', '#1B2918',
      '#D2E6C8', '#96B48D', '#688461',
      '#74A85A', '#84B969', 'rgba(116,168,90,0.24)',
      'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)',
      'rgba(15,24,13,0.78)', 'rgba(255,255,255,0.08)', 'rgba(116,168,90,0.14)',
    ),
  },
];

/**
 * Returns the named theme from built-ins or a custom list.
 * Falls back to sheepskin if not found.
 */
export function getTheme(id: unknown, customThemes: unknown = []): Theme {
  const normalizedId = normalizeThemeId(id);
  if (normalizedId === null) {
    return THEMES[0];
  }

  return (
    THEMES.find(t => normalizeThemeId(t.id) === normalizedId) ??
    getValidCustomThemes(customThemes).find(t => normalizeThemeId(t.id) === normalizedId) ??
    THEMES[0]
  );
}

function normalizeThemeId(id: unknown): string | null {
  if (typeof id !== 'string') {
    return null;
  }

  const normalizedId = id.trim().toLowerCase();
  return normalizedId === '' ? null : normalizedId;
}

function getValidCustomThemes(customThemes: unknown): Theme[] {
  if (!Array.isArray(customThemes)) {
    return [];
  }

  return customThemes.filter(isTheme);
}

function isTheme(theme: unknown): theme is Theme {
  if (!isRecord(theme)) {
    return false;
  }

  return (
    typeof theme.id === 'string' &&
    typeof theme.name === 'string' &&
    isRecord(theme.light) &&
    isRecord(theme.dark)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
