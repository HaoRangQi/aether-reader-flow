export interface TextRangeAnchor {
  text: string;
  start: number;
  end: number;
}

interface AnchorCandidate extends TextRangeAnchor {
  distance: number;
}

function textLength(node: Node): number {
  return node.textContent?.length ?? 0;
}

function boundaryOffset(root: Node, container: Node, offset: number): number | null {
  if (!root.contains(container)) return null;

  let total = 0;
  let found = false;

  const walk = (node: Node) => {
    if (found) return;
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += Math.min(offset, textLength(node));
      } else {
        const children = Array.from(node.childNodes).slice(0, offset);
        total += children.reduce((sum, child) => sum + textLength(child), 0);
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      total += textLength(node);
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      walk(child);
      if (found) return;
    }
  };

  walk(root);
  return found ? total : null;
}

export function anchorFromRange(root: Node, range: Range): TextRangeAnchor | null {
  if (!root.contains(range.commonAncestorContainer)) return null;

  const start = boundaryOffset(root, range.startContainer, range.startOffset);
  const end = boundaryOffset(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const rawText = range.toString();
  const text = rawText.trim();
  if (!text) return null;

  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const trailingWhitespace = rawText.length - rawText.trimEnd().length;

  return {
    text,
    start: start + leadingWhitespace,
    end: end - trailingWhitespace,
  };
}

export function restoreTextRangeAnchor(
  content: string,
  anchor: TextRangeAnchor,
): TextRangeAnchor | null {
  const quote = anchor.text.trim();
  if (!quote) return null;

  if (isExactAnchorMatch(content, quote, anchor.start, anchor.end)) {
    return { text: quote, start: anchor.start, end: anchor.end };
  }

  const expectedStart = clamp(anchor.start, 0, content.length);
  const candidates = [
    ...findExactCandidates(content, quote, expectedStart),
    ...findWhitespaceNormalizedCandidates(content, quote, expectedStart),
  ];

  const best = candidates.sort((a, b) => {
    const byDistance = a.distance - b.distance;
    if (byDistance !== 0) return byDistance;
    return Math.abs((a.end - a.start) - quote.length) - Math.abs((b.end - b.start) - quote.length);
  })[0];

  return best ? { text: best.text, start: best.start, end: best.end } : null;
}

function isExactAnchorMatch(content: string, quote: string, start: number, end: number): boolean {
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start &&
    end <= content.length &&
    content.slice(start, end) === quote
  );
}

function findExactCandidates(
  content: string,
  quote: string,
  expectedStart: number,
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];
  let index = content.indexOf(quote);

  while (index !== -1) {
    candidates.push({
      text: quote,
      start: index,
      end: index + quote.length,
      distance: Math.abs(index - expectedStart),
    });
    index = content.indexOf(quote, index + 1);
  }

  return candidates;
}

function findWhitespaceNormalizedCandidates(
  content: string,
  quote: string,
  expectedStart: number,
): AnchorCandidate[] {
  const normalizedQuote = quote.replace(/\s+/g, ' ');
  if (!/\s/.test(normalizedQuote)) return [];

  const candidates: AnchorCandidate[] = [];
  const pattern = normalizedQuote.split(' ').map(escapeRegExp).join('\\s+');
  const matcher = new RegExp(pattern, 'g');

  for (const match of content.matchAll(matcher)) {
    const start = match.index;
    const text = match[0];
    candidates.push({
      text,
      start,
      end: start + text.length,
      distance: Math.abs(start - expectedStart),
    });
  }

  return candidates;
}

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
