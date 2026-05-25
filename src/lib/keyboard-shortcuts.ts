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

const MODIFIER_ALIASES = new Map([
  ['alt', 'alt'],
  ['cmd', 'meta'],
  ['command', 'meta'],
  ['control', 'ctrl'],
  ['ctrl', 'ctrl'],
  ['meta', 'meta'],
  ['option', 'alt'],
  ['shift', 'shift'],
]);

const MODIFIER_ORDER = ['meta', 'ctrl', 'alt', 'shift'];

function normalizeShortcutCombo(combo: unknown): string | null {
  if (typeof combo !== 'string') return null;

  const modifiers = new Set<string>();
  let key: string | null = null;

  for (const rawPart of combo.split('+')) {
    const part = rawPart.trim().toLowerCase();
    if (!part) return null;

    const modifier = MODIFIER_ALIASES.get(part);
    if (modifier) {
      if (modifiers.has(modifier)) return null;
      modifiers.add(modifier);
      continue;
    }

    if (key) return null;
    key = part;
  }

  if (!key) return null;

  return [...MODIFIER_ORDER.filter(modifier => modifiers.has(modifier)), key].join('+');
}

function equivalentMetaCtrlCombos(combo: string): string[] {
  const equivalents = [combo];

  if (combo.includes('meta')) equivalents.push(combo.replace('meta', 'ctrl'));
  if (combo.includes('ctrl')) equivalents.push(combo.replace('ctrl', 'meta'));

  return equivalents;
}

/**
 * Returns true if `combo` matches `e`. The combo can use `cmd` (alias
 * for meta) and is matched case-insensitively. Meta and Ctrl are treated
 * as interchangeable so authors can write either.
 */
export function matchShortcut(combo: string, e: KeyboardEvent): boolean {
  const normalized = normalizeShortcutCombo(combo);
  if (!normalized) return false;

  const actual = eventCombo(e);
  return equivalentMetaCtrlCombos(normalized).includes(actual);
}

const TEXT_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function eventTargetElement(e: KeyboardEvent): HTMLElement | null {
  const target = e.target;
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/** True if the event target is within a text-input where shortcuts shouldn't fire. */
export function isInTextInput(e: KeyboardEvent): boolean {
  const t = eventTargetElement(e);
  if (!t) return false;
  if (TEXT_INPUT_TAGS.has(t.tagName)) return true;
  if (t.isContentEditable) return true;

  for (let node: HTMLElement | null = t; node; node = node.parentElement) {
    if (node.isContentEditable) return true;
    const editable = node.getAttribute('contenteditable');
    if (editable === null) continue;
    return editable.toLowerCase() !== 'false';
  }

  return false;
}

export function shouldHandleReaderShortcut(e: KeyboardEvent): boolean {
  return !e.defaultPrevented && !isInTextInput(e);
}

export function isPlainArrowNavigation(e: KeyboardEvent): boolean {
  return (
    (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey
  );
}
