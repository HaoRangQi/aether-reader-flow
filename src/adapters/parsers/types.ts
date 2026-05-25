/**
 * @fileoverview Adapter interface for PDF/EPUB/TXT parsers.
 *
 * PDF, EPUB, and TXT parsers conform to this interface. Future formats can
 * be added without changing reader-facing components.
 */

export interface ParsedOutlineItem {
  title: string;
  /** 1-based page number where this outline entry lives. */
  pageNumber: number;
}

export interface ParsedDocument {
  totalPages: number;
  /** Plain text extracted per page; `pageTexts[i-1]` corresponds to page `i`. */
  pageTexts: string[];
  outline: ParsedOutlineItem[];
  metadata: { title?: string; author?: string };
}

export interface DocumentParser {
  parse(file: Blob): Promise<ParsedDocument>;
}
