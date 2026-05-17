/**
 * @fileoverview Keyboard shortcut helpers.
 *
 * Matches against KeyboardEvent objects. `cmd` / `command` aliases to
 * `meta`. The matcher accepts both meta and ctrl as equivalent so the
 * same combo works on macOS and Win/Linux.
 */

/**
 * Build a normalized combo string from a KeyboardEvent:
 * "meta+ctrl+alt+shift+key" with only the active modifiers.
 */
function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('meta');
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

/**
 * Returns true if `combo` matches `e`. The combo can use `cmd` (alias
 * for meta) and is matched case-insensitively. Meta and Ctrl are treated
 * as interchangeable so authors can write either.
 */
export function matchShortcut(combo: string, e: KeyboardEvent): boolean {
  const normalized = combo
    .toLowerCase()
    .replace('cmd', 'meta')
    .replace('command', 'meta');
  const actual = eventCombo(e);
  return (
    actual === normalized ||
    actual === normalized.replace('meta', 'ctrl') ||
    actual === normalized.replace('ctrl', 'meta')
  );
}

/** True if the active element is a text-input where shortcuts shouldn't fire. */
export function isInTextInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}
