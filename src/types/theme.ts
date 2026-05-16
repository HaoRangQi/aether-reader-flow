/**
 * @fileoverview Theme system types.
 *
 * A `Theme` is a "theme pack" — two complementary palettes (light + dark).
 * Each palette is a flat `ColorTokens` object. The `ThemeProvider` (P5)
 * applies the currently selected palette to `:root` as CSS variables, and
 * Tailwind utilities consume them via `var(--color-*)`.
 *
 * See `docs/superpowers/specs/2026-05-16-aether-reader-flow-design.md` §7.2
 * for the full design rationale.
 */

/**
 * The semantic color palette a theme provides. Every component should style
 * itself in terms of these tokens, never raw hex values.
 *
 * Required keys (validated by the theme test):
 * - background: page-level paper color
 * - surface: secondary surface (cards, popovers when not glassy)
 * - surfaceElevated: tertiary surface (nested cards, popover hover)
 * - text / textMuted / textSubtle: 3-step typographic hierarchy
 * - accent / accentHover: primary interactive color
 * - selection: marker-pen-style highlight color
 * - success / warning / danger / info: status colors
 * - border / divider: 2-step separator strengths
 * - glassOverlay / glassBorder / glassGlow: the "glass tools" material props
 */
export interface ColorTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentHover: string;
  selection: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  border: string;
  divider: string;
  glassOverlay: string;
  glassBorder: string;
  glassGlow: string;
}

/**
 * A theme pack: an id (machine), name (human), and the two palettes.
 */
export interface Theme {
  id: string;
  name: string;
  light: ColorTokens;
  dark: ColorTokens;
}

/**
 * Theme mode preference:
 * - 'light' / 'dark': explicit choice
 * - 'auto': follow `prefers-color-scheme`
 */
export type ThemeMode = 'light' | 'dark' | 'auto';
