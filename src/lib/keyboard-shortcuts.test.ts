import { describe, expect, it } from 'vitest';
import {
  isInTextInput,
  isPlainArrowNavigation,
  matchShortcut,
  shouldHandleReaderShortcut,
} from './keyboard-shortcuts';

function keydown(target: HTMLElement, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'b',
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });
  return event;
}

describe('keyboard shortcuts', () => {
  it('matches Cmd and Ctrl variants of the same shortcut', () => {
    expect(matchShortcut('meta+b', keydown(document.createElement('div')))).toBe(true);
    expect(
      matchShortcut(
        'meta+shift+s',
        keydown(document.createElement('div'), { key: 's', metaKey: false, ctrlKey: true, shiftKey: true })
      )
    ).toBe(true);
  });

  it('normalizes shortcut casing, aliases, spacing, and modifier order', () => {
    const target = document.createElement('div');

    expect(matchShortcut('Shift + Command + S', keydown(target, { key: 'S', shiftKey: true }))).toBe(true);
    expect(matchShortcut('CTRL + B', keydown(target, { metaKey: false, ctrlKey: true }))).toBe(true);
    expect(matchShortcut('option + shift + meta + k', keydown(target, { key: 'K', altKey: true, shiftKey: true }))).toBe(
      true
    );
  });

  it('rejects ambiguous shortcut definitions', () => {
    const target = document.createElement('div');

    expect(matchShortcut('cmd+meta+b', keydown(target))).toBe(false);
    expect(matchShortcut('meta+b+c', keydown(target))).toBe(false);
    expect(matchShortcut('meta+', keydown(target))).toBe(false);
    expect(matchShortcut('+meta+b', keydown(target))).toBe(false);
    expect(matchShortcut('meta++b', keydown(target))).toBe(false);
  });

  it('rejects non-string shortcut definitions without throwing', () => {
    const target = document.createElement('div');

    expect(matchShortcut(null as unknown as string, keydown(target))).toBe(false);
    expect(matchShortcut(42 as unknown as string, keydown(target))).toBe(false);
    expect(matchShortcut({ combo: 'meta+b' } as unknown as string, keydown(target))).toBe(false);
  });

  it('treats typing surfaces as text input contexts', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editor = document.createElement('div');
    const editorChild = document.createElement('span');

    editor.setAttribute('contenteditable', 'true');
    editor.append(editorChild);
    document.body.append(input, textarea, select, editor);

    expect(isInTextInput(keydown(input))).toBe(true);
    expect(isInTextInput(keydown(textarea))).toBe(true);
    expect(isInTextInput(keydown(select))).toBe(true);
    expect(isInTextInput(keydown(editorChild))).toBe(true);
  });

  it('allows reader shortcuts outside typing surfaces', () => {
    const button = document.createElement('button');

    expect(shouldHandleReaderShortcut(keydown(button))).toBe(true);
    expect(shouldHandleReaderShortcut(keydown(document.createElement('input')))).toBe(false);
  });

  it('does not handle shortcuts already claimed by another control', () => {
    const event = keydown(document.createElement('button'));

    event.preventDefault();

    expect(shouldHandleReaderShortcut(event)).toBe(false);
  });

  it('only treats unmodified arrow keys as reader navigation', () => {
    const target = document.createElement('button');

    expect(isPlainArrowNavigation(keydown(target, { key: 'ArrowLeft', metaKey: false }))).toBe(true);
    expect(isPlainArrowNavigation(keydown(target, { key: 'ArrowRight', metaKey: false }))).toBe(true);
    expect(isPlainArrowNavigation(keydown(target, { key: 'ArrowRight', metaKey: true }))).toBe(false);
    expect(isPlainArrowNavigation(keydown(target, { key: 'ArrowRight', metaKey: false, shiftKey: true }))).toBe(false);
    expect(isPlainArrowNavigation(keydown(target, { key: 'b', metaKey: false }))).toBe(false);
  });
});
