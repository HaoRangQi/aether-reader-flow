'use client';

/**
 * @fileoverview ThemeProvider — runtime application of the active theme.
 *
 * Reads `theme` + `font` from configStore (hydrated by ConfigHydrator).
 * On every change:
 *   1. Determines effective mode (resolves `auto` against `prefers-color-scheme`)
 *   2. Toggles `.dark` class on `<html>`
 *   3. Writes all 18 ColorTokens to `:root` as CSS variables
 *   4. Writes font-family / size / line-height variables
 *
 * Subscribes to `prefers-color-scheme` so toggling system theme updates
 * the app without a reload (when mode is `auto`).
 */

import { useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { getTheme } from '@/lib/themes';
import type { ColorTokens } from '@/types/theme';

function applyTokens(t: ColorTokens) {
  const r = document.documentElement;
  r.style.setProperty('--color-background', t.background);
  r.style.setProperty('--color-surface', t.surface);
  r.style.setProperty('--color-surface-elevated', t.surfaceElevated);
  r.style.setProperty('--color-text', t.text);
  r.style.setProperty('--color-text-muted', t.textMuted);
  r.style.setProperty('--color-text-subtle', t.textSubtle);
  r.style.setProperty('--color-accent', t.accent);
  r.style.setProperty('--color-accent-hover', t.accentHover);
  r.style.setProperty('--color-selection', t.selection);
  r.style.setProperty('--color-success', t.success);
  r.style.setProperty('--color-warning', t.warning);
  r.style.setProperty('--color-danger', t.danger);
  r.style.setProperty('--color-info', t.info);
  r.style.setProperty('--color-border', t.border);
  r.style.setProperty('--color-divider', t.divider);
  r.style.setProperty('--color-glass-overlay', t.glassOverlay);
  r.style.setProperty('--color-glass-border', t.glassBorder);
  r.style.setProperty('--color-glass-glow', t.glassGlow);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, font, selectionPrefs, customThemes, hydrated } = useConfigStore();

  useEffect(() => {
    if (!hydrated) return;
    const themeObj = getTheme(theme.id, customThemes);
    const isDark =
      theme.mode === 'dark' ||
      (theme.mode === 'auto' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    applyTokens(isDark ? themeObj.dark : themeObj.light);

    // Reader font
    document.documentElement.style.setProperty(
      '--reader-font-family',
      font.readerFamily === 'default'
        ? 'var(--font-serif)'
        : font.readerFontValue || 'var(--font-serif)',
    );
    document.documentElement.style.setProperty('--reader-font-size', `${font.readerSize}px`);
    document.documentElement.style.setProperty('--reader-line-height', `${font.readerLineHeight}`);

    // UI font (whole app shell)
    document.documentElement.style.setProperty(
      '--ui-font-family',
      font.uiFamily === 'default'
        ? 'var(--font-sans)'
        : font.uiFontValue || 'var(--font-sans)',
    );

    // Bubble appearance — fall back to theme glass tokens when empty
    const tokens = isDark ? themeObj.dark : themeObj.light;
    document.documentElement.style.setProperty(
      '--color-bubble-bg',
      selectionPrefs.bubbleBg || tokens.glassOverlay,
    );
    document.documentElement.style.setProperty(
      '--color-bubble-text',
      selectionPrefs.bubbleText || tokens.text,
    );
    document.documentElement.style.setProperty(
      '--color-bubble-accent',
      selectionPrefs.bubbleAccent || tokens.accent,
    );
  }, [theme, font, selectionPrefs, customThemes, hydrated]);

  useEffect(() => {
    if (theme.mode !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const themeObj = getTheme(theme.id, customThemes);
      document.documentElement.classList.toggle('dark', mq.matches);
      applyTokens(mq.matches ? themeObj.dark : themeObj.light);
      const tokens = mq.matches ? themeObj.dark : themeObj.light;
      document.documentElement.style.setProperty(
        '--color-bubble-bg',
        selectionPrefs.bubbleBg || tokens.glassOverlay,
      );
      document.documentElement.style.setProperty(
        '--color-bubble-text',
        selectionPrefs.bubbleText || tokens.text,
      );
      document.documentElement.style.setProperty(
        '--color-bubble-accent',
        selectionPrefs.bubbleAccent || tokens.accent,
      );
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme.mode, theme.id, selectionPrefs, customThemes]);

  return <>{children}</>;
}
