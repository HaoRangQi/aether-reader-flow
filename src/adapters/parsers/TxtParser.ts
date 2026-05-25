/**
 * @fileoverview TxtParser — plain-text DocumentParser implementation.
 *
 * TXT has no native page or chapter structure, so we preserve paragraph
 * boundaries and split long files into stable pseudo-pages. Chapter detection
 * remains the responsibility of `detectChapters()`.
 */
import type { DocumentParser, ParsedDocument } from './types';

const MAX_PAGE_CHARS = 4500;
const MIN_PAGE_CHARS = 1;

export class TxtParser implements DocumentParser {
  async parse(file: Blob): Promise<ParsedDocument> {
    const raw = await file.text();
    const text = normalizeText(raw);
    const pageTexts = splitIntoPseudoPages(text, MAX_PAGE_CHARS);

    return {
      totalPages: pageTexts.length,
      pageTexts,
      outline: [],
      metadata: {},
    };
  }
}

export function normalizeText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u3000]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitIntoPseudoPages(text: string, maxChars = MAX_PAGE_CHARS): string[] {
  if (!text) return [''];
  const pageLimit = normalizePageCharLimit(maxChars);

  const pages: string[] = [];
  let current = '';
  for (const paragraph of text.split(/\n{2,}/)) {
    if (!paragraph) continue;
    if (paragraph.length > pageLimit) {
      if (current) {
        pages.push(current);
        current = '';
      }
      pages.push(...splitLongParagraph(paragraph, pageLimit));
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > pageLimit && current) {
      pages.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) pages.push(current);
  return pages.length > 0 ? pages : [''];
}

function normalizePageCharLimit(maxChars: number): number {
  if (!Number.isFinite(maxChars)) return MAX_PAGE_CHARS;
  return Math.max(MIN_PAGE_CHARS, Math.floor(maxChars));
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < paragraph.length; start += maxChars) {
    chunks.push(paragraph.slice(start, start + maxChars));
  }
  return chunks;
}
