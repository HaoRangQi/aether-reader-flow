import { describe, expect, it } from 'vitest';
import { anchorFromRange, restoreTextRangeAnchor } from './selection-anchor';

function selectText(root: HTMLElement, startNode: Node, start: number, endNode: Node, end: number) {
  const range = document.createRange();
  range.setStart(startNode, start);
  range.setEnd(endNode, end);
  return anchorFromRange(root, range);
}

describe('selection anchors', () => {
  it('computes offsets for repeated text by DOM range, not first string match', () => {
    const root = document.createElement('div');
    root.textContent = 'alpha beta alpha beta';
    document.body.appendChild(root);

    const text = root.firstChild!;
    const anchor = selectText(root, text, 11, text, 16);

    expect(anchor).toEqual({ text: 'alpha', start: 11, end: 16 });
    root.remove();
  });

  it('computes offsets across nested text nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = 'one <span>two <strong>three</strong></span> four';
    document.body.appendChild(root);

    const startNode = root.childNodes[1].firstChild!;
    const endNode = root.childNodes[1].childNodes[1].firstChild!;
    const anchor = selectText(root, startNode, 1, endNode, 3);

    expect(anchor).toEqual({ text: 'wo thr', start: 5, end: 11 });
    root.remove();
  });

  it('trims incidental selection whitespace while preserving true offsets', () => {
    const root = document.createElement('div');
    root.textContent = 'hello world';
    document.body.appendChild(root);

    const text = root.firstChild!;
    const anchor = selectText(root, text, 5, text, 11);

    expect(anchor).toEqual({ text: 'world', start: 6, end: 11 });
    root.remove();
  });

  it('computes offsets when a range boundary is an element child index', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span>alpha</span><span> beta</span><span> gamma</span>';
    document.body.appendChild(root);

    const anchor = selectText(root, root, 1, root, 3);

    expect(anchor).toEqual({ text: 'beta gamma', start: 6, end: 16 });
    root.remove();
  });

  it('computes offsets near the end of a large document without cloneContents', () => {
    const root = document.createElement('div');
    root.textContent = `${'x'.repeat(20_000)}target text`;
    document.body.appendChild(root);

    const text = root.firstChild!;
    const anchor = selectText(root, text, 20_000, text, 20_011);

    expect(anchor).toEqual({ text: 'target text', start: 20_000, end: 20_011 });
    root.remove();
  });

  it('restores a repeated quote near the previous offset after text shifts', () => {
    const content = 'target passage inserted before later target passage';
    const anchor = restoreTextRangeAnchor(content, {
      text: 'target passage',
      start: 20,
      end: 34,
    });

    expect(anchor).toEqual({ text: 'target passage', start: 37, end: 51 });
  });

  it('uses the first repeated quote when candidates are equally near the previous offset', () => {
    const content = 'target xx target';
    const anchor = restoreTextRangeAnchor(content, {
      text: 'target',
      start: 5,
      end: 11,
    });

    expect(anchor).toEqual({ text: 'target', start: 0, end: 6 });
  });

  it('restores a quote when chapter whitespace changes', () => {
    const content = 'alpha beta\n  gamma delta';
    const anchor = restoreTextRangeAnchor(content, {
      text: 'beta gamma',
      start: 6,
      end: 16,
    });

    expect(anchor).toEqual({ text: 'beta\n  gamma', start: 6, end: 18 });
  });

  it('restores whitespace-normalized quotes that contain regex special characters', () => {
    const content = 'intro alpha.+(beta)?\n  gamma* outro';
    const anchor = restoreTextRangeAnchor(content, {
      text: 'alpha.+(beta)? gamma*',
      start: 6,
      end: 28,
    });

    expect(anchor).toEqual({ text: 'alpha.+(beta)?\n  gamma*', start: 6, end: 29 });
  });

  it('recovers from non-finite and negative offsets without unstable candidate ordering', () => {
    const content = 'quote near start middle quote near end';

    expect(
      restoreTextRangeAnchor(content, {
        text: 'quote',
        start: Number.NaN,
        end: Number.NaN,
      }),
    ).toEqual({ text: 'quote', start: 0, end: 5 });

    expect(
      restoreTextRangeAnchor(content, {
        text: 'quote',
        start: Number.POSITIVE_INFINITY,
        end: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ text: 'quote', start: 24, end: 29 });

    expect(
      restoreTextRangeAnchor(content, {
        text: 'quote',
        start: -20,
        end: -15,
      }),
    ).toEqual({ text: 'quote', start: 0, end: 5 });
  });

  it('treats non-number persisted offsets as missing offsets', () => {
    const content = 'quote near start middle quote near end';
    const anchor = {
      text: 'quote',
      start: '24',
      end: '29',
    } as unknown as Parameters<typeof restoreTextRangeAnchor>[1];

    expect(restoreTextRangeAnchor(content, anchor)).toEqual({
      text: 'quote',
      start: 0,
      end: 5,
    });
  });

  it('returns null when a drifted quote cannot be recovered', () => {
    const anchor = restoreTextRangeAnchor('alpha beta gamma', {
      text: 'missing quote',
      start: 100,
      end: 120,
    });

    expect(anchor).toBeNull();
  });
});
