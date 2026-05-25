import { describe, expect, it } from 'vitest';
import { normalizeText, splitIntoPseudoPages, TxtParser } from './TxtParser';

describe('TxtParser', () => {
  it('parses plain text into pseudo-pages', async () => {
    const parser = new TxtParser();
    const result = await parser.parse(
      new Blob(['第一段\n\n第二段'], { type: 'text/plain' }),
    );

    expect(result.totalPages).toBe(1);
    expect(result.pageTexts).toEqual(['第一段\n\n第二段']);
    expect(result.outline).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it('normalizes BOM, CRLF, trailing spaces, and excessive blank lines', () => {
    expect(normalizeText('\uFEFF第一行  \r\n\u3000\r\n\r\n第二行\t\r\n')).toBe(
      '第一行\n\n第二行',
    );
  });

  it('splits on paragraph boundaries when possible', () => {
    const pages = splitIntoPseudoPages('a'.repeat(4) + '\n\n' + 'b'.repeat(4), 6);
    expect(pages).toEqual(['aaaa', 'bbbb']);
  });

  it('splits long paragraphs when no paragraph boundary exists', () => {
    const pages = splitIntoPseudoPages('abcdefghi', 4);
    expect(pages).toEqual(['abcd', 'efgh', 'i']);
  });

  it('normalizes invalid pseudo-page limits before splitting', () => {
    expect(splitIntoPseudoPages('abc', 0)).toEqual(['a', 'b', 'c']);
    expect(splitIntoPseudoPages('abcde', 2.8)).toEqual(['ab', 'cd', 'e']);
    expect(splitIntoPseudoPages('abc', Number.POSITIVE_INFINITY)).toEqual(['abc']);
  });
});
